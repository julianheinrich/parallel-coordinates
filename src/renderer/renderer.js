
var renderer = {
  types: {
    "None": {
      install: function(pc) {},           // Nothing to be done.
      clear: function(layer) {},
      uninstall: function(pc) {}		  // Nothing to be done.
    }
  },
  type: "None",
  currentRenderer: function() {
    return this.types[this.type];
  }
};

pc.renderTypes = function() {
  return Object.getOwnPropertyNames(renderer.types);
};

pc.renderType = function(type) {
  if (arguments.length === 0) {
    return renderer.type;
  }

  if (pc.renderTypes().indexOf(type) === -1) {
    throw "pc.renderer: Unsupported renderer: " + type;
  }

  // Make sure that we don't trigger unnecessary events by checking if the mode
  // actually changes.
  if (type !== renderer.type) {
    // When changing brush modes, the first thing we need to do is clearing any
    // brushes from the current mode, if any.
    if (renderer.type !== "None") {
      pc.resetRenderer();
    }

    // Next, we need to 'uninstall' the current brushMode.
    renderer.types[renderer.type].uninstall(pc);
    
    // remove axes and svg layer
    pc.selection.selectAll('svg').remove();
    
    // Finally, we can install the requested one.
    renderer.type = type;
    renderer.types[renderer.type].install();

    // for now, keep svg tick and brush layers the same
    // for all renderer
    pc.svg = pc.selection
      .append("svg")
        .attr("width", __.width)
        .attr("height", __.height)
      .append("svg:g")
        .attr("transform", "translate(" + __.margin.left + "," + __.margin.top + ")");
    
//    pc.createAxes();
 // axes, destroys old brushes.
    if (g) pc.createAxes();
    var bm = pc.brushMode();
    pc.brushMode("None").brushMode(bm);
    
  }

  return pc;
};

