//render-mode: canvas

(function() {

	// draw little dots on the axis line where data intersects
	function axisDots() {
		var ctx = pc.ctx.marks;
		ctx.globalAlpha = d3.min([ 1 / Math.pow(__.data.length, 1 / 2), 1 ]);
		__.data.forEach(function(d) {
			__.dimensions.map(function(p, i) {
				ctx.fillRect(position(p) - 0.75, yscale[p](d[p]) - 0.75, 1.5, 1.5);
			});
		});
		return this;
	};

	function clear(layer) {
		ctx[layer].clearRect(0,0,w()+2,h()+2);
		return this;
	};

	function install() {
		layers.forEach(function(layer) {
			canvas[layer] = pc.selection
			.append("canvas")
			.attr("class", layer)[0][0];
			ctx[layer] = canvas[layer].getContext("2d");
		});

		pc.shadows = shadows;
		pc.axisDots = axisDots;
		pc.render = render;
		pc.resetRenderer = resetRenderer;
		pc.clear = clear;
		pc.resize = resize;
		
		
	}

	function uninstall() {
		resetRenderer();
	}
	
	function resize() {
		// canvas sizes
		pc.selection.selectAll("canvas")
		.style("margin-top", __.margin.top + "px")
		.style("margin-left", __.margin.left + "px")
		.attr("width", w()+2)
		.attr("height", h()+2);

		// default styles, needs to be set when canvas width changes
		ctx.foreground.strokeStyle = __.color;
		ctx.foreground.lineWidth = 1.4;
		ctx.foreground.globalCompositeOperation = __.composite;
		ctx.foreground.globalAlpha = __.alpha;
		ctx.highlight.lineWidth = 3;
		ctx.shadows.strokeStyle = "#dadada";

	}

	// draw single cubic bezier curve
	function single_curve(d, ctx) {

		var centroids = compute_centroids(d);
		var cps = compute_control_points(centroids);

		ctx.moveTo(cps[0].e(1), cps[0].e(2));
		for (var i = 1; i < cps.length; i += 3) {
			if (__.showControlPoints) {
				for (var j = 0; j < 3; j++) {
					ctx.fillRect(cps[i+j].e(1), cps[i+j].e(2), 2, 2);
				}
			}
			ctx.bezierCurveTo(cps[i].e(1), cps[i].e(2), cps[i+1].e(1), cps[i+1].e(2), cps[i+2].e(1), cps[i+2].e(2));
		}
	};

	// draw single polyline
	function color_path(d, i, ctx) {
		ctx.strokeStyle = d3.functor(__.color)(d, i);
		ctx.beginPath();
		if ((__.bundleDimension !== null && __.bundlingStrength > 0) || __.smoothness > 0) {
			single_curve(d, ctx);
		} else {
			single_path(d, ctx);
		}
		ctx.stroke();
	};

	// draw many polylines of the same color
	function paths(data, ctx) {
		ctx.clearRect(-1, -1, w() + 2, h() + 2);
		ctx.beginPath();
		data.forEach(function(d) {
			if ((__.bundleDimension !== null && __.bundlingStrength > 0) || __.smoothness > 0) {
				single_curve(d, ctx);
			} else {
				single_path(d, ctx);
			}
		});
		ctx.stroke();
	};

	function single_path(d, ctx) {
		__.dimensions.map(function(p, i) {
			if (i == 0) {
				ctx.moveTo(position(p), yscale[p](d[p]));
			} else {
				ctx.lineTo(position(p), yscale[p](d[p]));
			}
		});
	}

	function path_foreground(d, i) {
		return color_path(d, i, ctx.foreground);
	};

	function path_highlight(d, i) {
		return color_path(d, i, ctx.highlight);
	};

	function render() {
		// try to autodetect dimensions and create scales
		if (!__.dimensions.length) pc.detectDimensions();
		if (!(__.dimensions[0] in yscale)) pc.autoscale();

		render[__.mode]();

		events.render.call(this);
		return this;
	}

	render['default'] = function() {
		clear('foreground');
		clear('highlight');
		if (__.brushed) {
			__.brushed.forEach(path_foreground);
			__.highlighted.forEach(path_highlight);
		} else {
			__.data.forEach(path_foreground);
			__.highlighted.forEach(path_highlight);
		}
	};
//
//	var rqueue = d3.renderQueue(path_foreground)
//	.rate(50)
//	.clear(function() {
//		pc.clear('foreground');
//		pc.clear('highlight');
//	});
//
//	pc.render.queue = function() {
//		if (__.brushed) {
//			rqueue(__.brushed);
//			__.highlighted.forEach(path_highlight);
//		} else {
//			rqueue(__.data);
//			__.highlighted.forEach(path_highlight);
//		}
//	};

	function resetRenderer() {
		layers.forEach(function(layer) {
			delete ctx[layer];
			delete canvas[layer];
		});
	}

	function shadows() {
		flags.shadows = true;
		if (__.data.length > 0) {
			paths(__.data, ctx.shadows);
		}
		return this;
	}

	renderer.types["canvas"] = {
			install: install,
			uninstall: uninstall
	}

})();