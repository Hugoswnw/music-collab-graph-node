const width = 1000, height = 1000;
const svg = d3.select('#graph').append("svg")
    .attr("id", "svg")
    .attr("width", width)
    .attr("height", height);

const tooltip = d3.select('#tooltip');
var simulation = d3.forceSimulation()
    .force("link", d3.forceLink()
        .distance(100)
        .strength(d => d.weight)
        .id(d => d.id))
    .force("charge", d3.forceManyBody())
    .force("center", d3.forceCenter(width / 2, height / 2));
var node, link;

function loadGraph(){
    d3.json("/graph").then(function (json) {
        console.log(json);

        node = svg.append("g")
            .attr("class", "nodes")
            .selectAll("g")
            .data(json.nodes)
            .enter()
            .append("g");
        node.append("circle")
            .attr("r", d => 15+(d.popularity)/2)
            .attr("class", "outercircle");
        node.append("circle")
            .attr("r", d => 15+(d.popularity)/4)
            .attr("class", "innercircle");
        node.append("text")
            .text(d => d.name)
            .attr("class", "label");

        link = svg.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(json.links)
            .enter().append("line");

        simulation
            .nodes(json.nodes)
            .on("tick", ticked);
        simulation.force("link")
            .links(json.links);

    });
}

function ticked() {
    link
        .attr("x1", function(d) { return d.source.x; })
        .attr("y1", function(d) { return d.source.y; })
        .attr("x2", function(d) { return d.target.x; })
        .attr("y2", function(d) { return d.target.y; });

    node
        .attr("transform", function(d) { return "translate("+d.x+" "+d.y+")"; });
}

function nextStep(){
    $("#stepBar").attr('class', 'indeterminate');
    $('#stepButton').addClass('disabled');
    $.post( "/graphstep", function( json ) {
        node = svg.append("g")
            .attr("class", "nodes")
            .selectAll("g")
            .data(json.nodes)
            .enter()
            .append("g");
        node.append("circle")
            .attr("r", d => 15+(d.popularity)/2)
            .attr("class", "outercircle");
        node.append("circle")
            .attr("r", d => 15+(d.popularity)/4)
            .attr("class", "innercircle");
        node.append("text")
            .text(d => d.name)
            .attr("class", "label");

        link = svg.append("g")
            .attr("class", "links")
            .selectAll("line")
            .data(json.links)
            .enter().append("line");

        simulation
            .nodes(json.nodes)
            .on("tick", ticked);
        simulation.force("link")
            .links(json.links);

        $("#stepBar").attr('class', 'determinate');
        $('#stepButton').removeClass('disabled');
    });
}

$( document ).ready(()=>{
    loadGraph();
})
