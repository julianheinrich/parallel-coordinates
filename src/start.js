d3.parcoords = function(config) {
  var __ = {
    data: [],
    highlighted: [],
    dimensions: [],
    dimensionTitles: {},
    dimensionTitleRotation: 0,
    types: {},
    brushed: false,
    width: 600,
    height: 300,
    margin: { top: 24, right: 0, bottom: 12, left: 0 },
    color: "#069",
    hideAxis : [],
    bundlingStrength: 0.5,
	bundleDimension: null,
	smoothness: 0.0,
	showControlPoints: false
  };

  extend(__, config);
