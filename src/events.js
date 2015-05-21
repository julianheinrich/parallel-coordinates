var events = d3.dispatch.apply(this,["render", "resize", "highlight", "brush", "brushend", "axesreorder"].concat(d3.keys(__))),
    w = function() { return __.width - __.margin.right - __.margin.left; },
    h = function() { return __.height - __.margin.top - __.margin.bottom; },
    flags = {
      brushable: false,
      reorderable: false,
      axes: false,
      interactive: false,
      shadows: false,
      debug: false,
      gl: false
    },
    xscale = d3.scale.ordinal(),
    yscale = {},
    dragging = {},
    line = d3.svg.line(),
    axis = d3.svg.axis().orient("left").ticks(5),
    g, // groups for axes, brushes
    canvas = {},
    clusterCentroids = [];

// side effects for setters
var side_effects = d3.dispatch.apply(this,d3.keys(__))
  .on("width", function(d) { pc.resize(); })
  .on("height", function(d) { pc.resize(); })
  .on("margin", function(d) { pc.resize(); })
  .on("data", function(d) {
    if (flags.shadows){pc.shadows();}
  })
  .on("dimensions", function(d) {
    xscale.domain(__.dimensions);
    if (flags.interactive){pc.render().updateAxes();}
  })
  .on("hideAxis", function(d) {
	  if (!__.dimensions.length) pc.detectDimensions();
	  pc.dimensions(without(__.dimensions, d.value));
  })
  .on("bundleDimension", function(d) {
	if (!__.dimensions.length) pc.detectDimensions();
	if (!(__.dimensions[0] in yscale)) pc.autoscale();
	if (typeof d.value === "number") {
		if (d.value < __.dimensions.length) {
			__.bundleDimension = __.dimensions[d.value];
		} else if (d.value < __.hideAxis.length) {
			__.bundleDimension = __.hideAxis[d.value];
		}
	} else {
		__.bundleDimension = d.value;
	}

	__.clusterCentroids = compute_cluster_centroids(__.bundleDimension);
  });

// expose the state of the chart
pc.state = __;
pc.flags = flags;

// create getter/setters
getset(pc, __, events, side_effects);

// expose events
d3.rebind(pc, events, "on");

// getter/setter with event firing
function getset(obj,state,events, side_effects)  {
  d3.keys(state).forEach(function(key) {
    obj[key] = function(x) {
      if (!arguments.length) {
		return state[key];
      }
      var old = state[key];
      state[key] = x;
      if (side_effects !== undefined) {
    	  side_effects[key].call(pc,{"value": x, "previous": old});
      }
      if (events !== undefined) {
    	  events[key].call(pc,{"value": x, "previous": old});
      }
      return obj;
    };
  });
};

function extend(target, source) {
  for (key in source) {
    target[key] = source[key];
  }
  return target;
};

function without(arr, item) {
  return arr.filter(function(elem) { return item.indexOf(elem) === -1; })
};
