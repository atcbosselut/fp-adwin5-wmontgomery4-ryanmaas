// Constants
var SVG_WIDTH = 550,
    SVG_HEIGHT = 500,
    SVG_OFFSET = 40,
    DURATION = 1000,
    STROKE_WIDTH = 4.0,
    NUM_BODYPART = 10,
    NUM_QUESTIONS = 38,
//    NUM_BODYPART = 24,
//    NUM_QUESTIONS = 132,
    WEIGHT_THRESHOLD = 1 / NUM_BODYPART,
    DATA_DIR = 'bodypart_' + NUM_BODYPART;

// Globals we'll manipulate
var trees = [],
    nameIndex = {},
    questions = [],
    weightMatrix = [],
    seq = 0;

// Initialize tree layout
//var tree = d3.layout.cluster()
var layout = d3.layout.tree()
    .size([SVG_HEIGHT, SVG_WIDTH-2*SVG_OFFSET]);

// Flip x/y to get left to right tree
var diagonal = d3.svg.diagonal()
    .projection(d => [d.y, d.x]);

// Interpolate color based on weight strength
var color = d3.interpolateRgb("#f00", "#000");

// Sorting function to keep everything sane
// NOTE: this is annoying because of the weightMatrix ordering
function sortNames(a,b) {
    if (a === 'body_part') return -1;
    if (b === 'body_part') return 1;
    return nameIndex[a] - nameIndex[b];
}

/********************
 ** INITIALIZATION **
 ********************/
var names_txt = DATA_DIR + '/list_of_words_bodypart.txt';
var questions_txt = DATA_DIR + '/questions_bodypart.txt';
var weights_txt = DATA_DIR + '/edge_prob_bodypart.txt';

function jsonFile(seq) {
    padded = ('0000' + seq).slice(-4);
    return DATA_DIR + '/body_part_json/' + padded + '.json';
}

var queue = queue()
    .defer(d3.text, names_txt)
    .defer(d3.text, weights_txt)
    .defer(d3.text, questions_txt);

queue.await(function(error, names_raw, weights_raw, questions_raw) {
    if (error) throw error;

    // setup nameIndex
    var names = names_raw.split("\n");
    names.pop(); // Drop empty last string

    nameIndex = {};
    names.forEach( (name, i) => nameIndex[name] = i );

    // Tricky stuff to format the weight matrix manually
    // (d3.csv doesn't work for some reason)
    weightMatrix = weights_raw.split("\n");
    weightMatrix.shift(); // Remove first row, corresponds to prior
    weightMatrix.pop(); // Remove last row, it's just an empty string

    // Reshape rows
    weightMatrix = weightMatrix.map(function(matrix_str) {
        var flattened = matrix_str.split(",");
        var matrix = [];
        for (var i = 0; i < NUM_BODYPART; i++) {
            var withEntity = NUM_BODYPART + 1;
            matrix.push(flattened.slice(withEntity*i, withEntity*(i+1)));
        }
        return matrix;
    });

    // Parse questions
    questions = questions_raw.split("\n");
    questions.pop(); // Remove empty last string
    questions = questions.map( (raw) => raw.split(",") );
});


/*****************
 ** INTERACTION **
 *****************/
// setup scrolling buttons
$("#startBTN").click(function() {
    if (seq > 0) return;
    d3.json(jsonFile(seq), function(root) {
        trees.push(root);
        createNextQuestion();
    });
});

function createNextQuestion(){
    // Append SVG objects for next question and tree

    // Create the next question and buttons
    var q = d3.select("#timeline").append("div")
        .attr("class", "row log well col-md-12")
        .attr("id", "q" + seq);

    var parent = questions[seq][0],
        child = questions[seq][1];
    q.append("h3")
        .text("Question " + (seq + 1) +  ") Is '" + child + "' a descendant of '" + parent + "'?");

    var yesButton = q.append("button")
        .attr("class", "yes btn btn-default btn-default-md")
        .text("Yes")

    var noButton = q.append("button")
        .attr("class", "no btn btn-default btn-default-md")
        .text("No")

    var nextButton = q.append("button")
        .attr("class", "next btn btn-default btn-default-md pull-right")
        .text("Next")
        .style("visibility", "hidden")

    // Scroll to new question
    $('html,body').animate({scrollTop: $("#q"+seq).offset().top}, 'slow');

    // Create the first chart and draw it
    var row = d3.select("#timeline").append("div")
        .attr("class", "row")
        .attr("id", "r" + seq);

    var chart = row.append("div")
        .attr("class", "block chart")

    drawChart(chart, seq);

    // Set up the buttons
    function update() {
        seq++;
        d3.json(jsonFile(seq), function(error, root) {
            if (error) throw error;
            trees.push(root);
            updateChart(chart);
            q.select("button.next").style("visibility", "visible");
        })
    }

    var yesNoClicked = false;
    yesButton.on("click", function() {
        if (yesNoClicked++) return;
        q.select("button.no").style("visibility", "hidden");
        update()
    });

    noButton.on("click", function() {
        if (yesNoClicked++) return;
        q.select("button.yes").style("visibility", "hidden");
        update()
    });

    var nextClicked = false;
    nextButton.on("click", function() {
        if (!yesNoClicked) return;
        if (nextClicked++) return; // set clicked true, nifty
        createNextQuestion();
    });
}

function drawChart(chart, seq) {
    if (trees.length <= seq) {
        throw "TODO: preload, etc.";
    }

    // Store the sequence number
    chart.seq = seq;

    // NOTE: keep nodes sorted for transitioning properly
    var root = trees[seq]
    var nodes = layout.nodes(root).sort((a,b) => sortNames(a.name, b.name));
    var links = layout.links(nodes).sort((a,b) => sortNames(a.target.name, b.target.name));

    // Store edge strength
    // TODO: Store hiddenLinks
    links.forEach(function(link) {
        var targetIndex = nameIndex[link.target.name];
            sourceIndex = (link.source.name === 'body_part') ? 0 :
                                nameIndex[link.source.name] + 1;
        link.strength = weightMatrix[seq][targetIndex][sourceIndex];
    });

    // Create the chart
    var svg = chart.append("svg")
        .attr("width", SVG_WIDTH)
        .attr("height", SVG_HEIGHT)
      .append("g")
        .attr("transform", "translate(" + SVG_OFFSET + ",0)");

    // Set up svg elements
    var link = svg.selectAll("path.link")
        .data(links)
      .enter().append("path")
        .attr("class", "link")
        .attr("d", diagonal)
        .attr("stroke", l => color(l.strength))
        .attr("stroke-width", l => Math.max(1.0, l.strength * STROKE_WIDTH));

    var node = svg.selectAll("g.node")
        .data(nodes)
      .enter().append("g")
        .attr("class", "node")
        .attr("transform", d => "translate(" + d.y + "," + d.x + ")")
//        .on("mouseover", highlightNode)
//        .on("mouseout", unHighlightNode)

    node.append("rect")
        .attr("width", d => 10 + d.name.length * 6)
        .attr("x", d => -5 - d.name.length * 3)
        .attr("height", 20)
        .attr("y", -10);

    node.append("text")
        .attr("dy", 4)
        .attr("text-anchor", "middle")
        .text(d => d.name);
}

function updateChart(chart) {
    chart.seq++;

    if (trees.length <= chart.seq) {
        throw "TODO: preload, etc.";
    }

    // NOTE: keep nodes sorted for transitioning properly
    console.log(trees);
    console.log(chart.seq);
    var root = trees[chart.seq]
    var nodes = layout.nodes(root).sort((a,b) => sortNames(a.name, b.name));
    var links = layout.links(nodes).sort((a,b) => sortNames(a.target.name, b.target.name));

    // Store edge strength
    // TODO: Store hiddenlinks
    links.forEach(function(link) {
        var targetIndex = nameIndex[link.target.name];
            sourceIndex = (link.source.name === 'body_part') ? 0 :
                                nameIndex[link.source.name] + 1;
        link.strength = weightMatrix[chart.seq][targetIndex][sourceIndex];
    });

    // Update chart with smooth transition
    var link = chart.selectAll("path.link")
        .data(links)
        .transition()
        .duration(DURATION)
        .attr("d", diagonal)
        .style("stroke", l => color(l.strength))
        .style("stroke-width", l => Math.max(1.0, l.strength * STROKE_WIDTH));

    var node = chart.selectAll("g.node")
        .data(nodes)
        .transition()
        .duration(DURATION)
        .attr("transform", d => "translate(" + d.y + "," + d.x + ")");
}
