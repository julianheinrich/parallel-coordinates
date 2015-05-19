
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

pc.renderers = function() {
  return Object.getOwnPropertyNames(renderer.types);
};

pc.renderType = function(type) {
  if (arguments.length === 0) {
    return renderer.type;
  }

  if (pc.renderers().indexOf(type) === -1) {
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
    // Finally, we can install the requested one.
    renderer.type = type;
    renderer.types[renderer.type].install();
//    if (mode === "None") {
//      delete pc.brushPredicate;
//    } else {
//      pc.brushPredicate = brushPredicate;
//    }
  }

  return pc;
};

