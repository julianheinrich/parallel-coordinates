//renderGL.js

(function() {

	var config = {
			alpha: 0.7,
			normalize: false,
			variance: 0.001,
			mode: "default",
			composite: "source-over"
	};
	
	var shaders = {},
	lineShader = null,
	splatShader = null,
	fboShader = null,
	encodeShader = null,
	linePositionBufferObject,
	linePositions,
	lineColors,
	lineColorBufferObject,
	firstIndex = {},
	numItems = {},
	mvpMatrixHandle,
	mvpMatrix = null,
	projectionMatrix = null,
	modelMatrix = null,
	densityParameters,
	densityParameterBufferObject,
	framebufferPositions,
	framebufferTexCoords,
	layers = ["foreground"],
	gl = null;

	var ctx = {};
	var rttFramebuffer, outputFramebuffer;
	var rttTexture, outputTexture;
	var outputStorage;
	var outputConverted;
	
	function logGLCall(functionName, args) {   
		console.log("gl." + functionName + "(" + 
				WebGLDebugUtils.glFunctionArgsToString(functionName, args) + ")");   
	} 

	function install() {
		if (typeof mat4 === 'undefined') {
			throw "please include gl-matrix.js";
		}

		layers.forEach(function(layer) {
			canvas[layer] = pc.selection
			.append("canvas")
			.attr("class", layer)[0][0];
			ctx[layer] = canvas[layer].getContext("experimental-webgl", {alpha: false}) || 
			canvas[layer].getContext("webgl", {alpha: false});
		});

//		gl = ctx["foreground"] = WebGLDebugUtils.makeDebugContext(canvas["foreground"].getContext("experimental-webgl", {alpha: false}), undefined, logGLCall);
		gl = ctx["foreground"];

		if (!gl.getExtension('OES_texture_float')) {
			throw new Error('This demo requires the OES_texture_float extension');
		}
		
		var e = d3.dispatch.apply(this, d3.keys(config));

		// expose the state of the renderer
		pc.state.renderer = config;
		// create getter/setters
		getset(pc, config, e);
		// expose events
		d3.rebind(pc, e, "on");

		setupShaders();
		initTextureFramebuffers();

		pc.render = render;
		pc.clear = clear;
		
//		uploadData(__.data);
//		side_effects.on("data", function(d) {
//			uploadData(d.value);
//		});
		
		resize();

	}

	function uninstall() {
		layers.forEach(function(layer) {
			delete ctx[layer];
			delete canvas[layer];
		});
		
		pc.selection.selectAll("canvas").remove();
	}
	
	function initTextureFramebuffers() {
		if (w() <= 0 || h() <= 0) return;

		rttFramebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
		rttFramebuffer.width = w();
		rttFramebuffer.height = h();

		rttTexture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, rttTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); //Prevents s-coordinate wrapping (repeating).
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); //Prevents t-coordinate wrapping (repeating).

		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rttFramebuffer.width, rttFramebuffer.height, 0, gl.RGBA, gl.FLOAT, null);

		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, rttTexture, 0);

		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		// setup fbo coordinates
		var fboCoords = [
		                 1,  1,
		                 -1,  1,
		                 -1, -1,
		                 1,  1,
		                 -1, -1,
		                 1, -1
		                 ];

		framebufferPositions = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, framebufferPositions);
		gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(fboCoords), gl.STATIC_DRAW);
		framebufferPositions.itemSize = 2;
		framebufferPositions.numItems = fboCoords.length / framebufferPositions.itemSize;

		outputFramebuffer = gl.createFramebuffer();
		gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);
		outputFramebuffer.width = rttFramebuffer.width;
		outputFramebuffer.height = rttFramebuffer.height;

		// outputTexture used to encode floats
		outputTexture = gl.createTexture();
		outputTexture.width = rttFramebuffer.width;
		outputTexture.height = rttFramebuffer.height;
		gl.bindTexture(gl.TEXTURE_2D, outputTexture);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); //Prevents s-coordinate wrapping (repeating).
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); //Prevents t-coordinate wrapping (repeating).

		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, rttFramebuffer.width, rttFramebuffer.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, outputTexture, 0);

		outputStorage = new Uint8Array(outputTexture.width * outputTexture.height * 4);
		outputConverted = new Float32Array(outputTexture.width * outputTexture.height);

		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	function clear(layer) {
		gl.clearColor(1, 1, 1, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
	};

	var glqueue = d3.renderQueue(function(chunk) {
		drawSplats(chunk);
	})
	.rate(50)
	.clear(function() { pc.clear('foreground'); });

//	pc.render.queueGL = function() {
//
//		pc.clear('foreground');
//
//		gl.viewport(0, 0, w(), h());
//
//		gl.enable(gl.BLEND);
//		gl.disable(gl.DEPTH_TEST);
//
//		projectionMatrix = mat4.create();
//		modelMatrix = mat4.create();
//		mat4.ortho(0, w(), h()+2, 1, -1.0, 1.0, projectionMatrix);
//		mat4.identity(modelMatrix);
//
////		gl.useProgram(splatShader);
//
//		if (__.brushed) {
//			glqueue(__.brushed);
//		} else {
//			glqueue(__.data);
//		}
//	}

	function render() {
		// try to autodetect dimensions and create scales
		if (!__.dimensions.length) pc.detectDimensions();
		if (!(__.dimensions[0] in yscale)) pc.autoscale();

		render[config.mode]();

		events.render.call(this);
		return this;
	}
	
	render['default'] = function() {
		
		// try to autodetect dimensions and create scales
		if (!__.dimensions.length) pc.detectDimensions();
		if (!(__.dimensions[0] in yscale)) pc.autoscale();
		
		if (config.normalize) {
			gl.bindFramebuffer(gl.FRAMEBUFFER, rttFramebuffer);
			gl.viewport(0, 0, rttFramebuffer.width, rttFramebuffer.height);
			// set background to black for normalization to work properly
			gl.clearColor(0, 0, 0, 1); 
		} else {
			gl.clearColor(1, 1, 1, 1);	// white by default
			gl.viewport(0, 0, w(), h());
		}

		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.enable(gl.BLEND);
		gl.disable(gl.DEPTH_TEST);

		switch(__.renderer.composite) {
		case "source-over": gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		break;
		case "lighter": gl.blendFunc(gl.ONE, gl.ONE);	// additive blending
		break;
		default: gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
		}

		projectionMatrix = mat4.create();
		modelMatrix = mat4.create();
		mat4.ortho(projectionMatrix, 0, w(), h()+2, 1, -1.0, 1.0);
		mat4.identity(modelMatrix);

		var draw = drawSplats;

		if (__.renderer.variance <= 0.001) {	
			draw = drawLines;
		} else {
			draw = drawSplats;
		}

		if (__.brushed) {
			draw(__.brushed);
		} else {
			draw(__.data);
		}

		if (__.renderer.normalize) {
			// RENDER TO encode floats as unsigned byte
			gl.bindFramebuffer(gl.FRAMEBUFFER, outputFramebuffer);
			gl.clearColor(0, 0, 0, 1); // black
			gl.clear(gl.COLOR_BUFFER_BIT);
//			pc.clear('foreground');

			gl.useProgram(encodeShader);

			gl.viewport(0, 0, outputFramebuffer.width, outputFramebuffer.height);
			gl.disable(gl.BLEND);

			gl.enableVertexAttribArray(encodeShader.vertex);
			gl.bindBuffer(gl.ARRAY_BUFFER, framebufferPositions);
			gl.vertexAttribPointer(encodeShader.vertex, framebufferPositions.itemSize, gl.FLOAT, false, 0, 0);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, rttTexture);
			gl.uniform1i(encodeShader.texture, 0);

			gl.drawArrays(gl.TRIANGLES, 0, framebufferPositions.numItems);

			// read back to CPU
			gl.readPixels(0, 0, outputTexture.width, outputTexture.height, gl.RGBA, gl.UNSIGNED_BYTE, outputStorage);
			outputConverted = new Float32Array(outputStorage.buffer);

			var min = 1000000, max = 0;
			for (var i = 0; i < outputConverted.length; ++i) {
				if (outputConverted[i] < min) {
					min = outputConverted[i];
				}
				if (outputConverted[i] > max) {
					max = outputConverted[i];
				}
			}

			//console.log("min: " + min + ", max:" + max);

			gl.bindFramebuffer(gl.FRAMEBUFFER, null);

//			gl.clear(gl.COLOR_BUFFER_BIT);
			pc.clear('foreground');

			gl.useProgram(fboShader);

			gl.viewport(0, 0, w(), h());

			gl.enableVertexAttribArray(fboShader.vertex);
			gl.bindBuffer(gl.ARRAY_BUFFER, framebufferPositions);
			gl.vertexAttribPointer(fboShader.vertex, framebufferPositions.itemSize, gl.FLOAT, false, 0, 0);

			gl.activeTexture(gl.TEXTURE0);
			gl.bindTexture(gl.TEXTURE_2D, rttTexture);
			gl.uniform1i(fboShader.texture, 0);

			gl.uniform1f(fboShader.min, min);
			gl.uniform1f(fboShader.max, max);

			gl.drawArrays(gl.TRIANGLES, 0, framebufferPositions.numItems);

		}

	}

	function resize() {
		// canvas sizes
		pc.selection.selectAll("canvas")
		.style("margin-top", __.margin.top + "px")
		.style("margin-left", __.margin.left + "px")
		.attr("width", w()+2)
		.attr("height", h()+2);
	}
	
	function drawLines(data) {
		// upload data and color to the GPU
		// NOTE: this should only be done once, not on every redraw
		uploadData(data);
//		uploadColors(data);

		gl.useProgram(lineShader);

		// Pass in the position information
		gl.enableVertexAttribArray(lineShader.positionAttribute);
		gl.bindBuffer(gl.ARRAY_BUFFER, linePositionBufferObject);
		gl.vertexAttribPointer(lineShader.positionAttribute, linePositionBufferObject.itemSize, gl.FLOAT, false, 0, 0);

		// Pass in the color information
		gl.enableVertexAttribArray(lineShader.colorAttribute);
		gl.bindBuffer(gl.ARRAY_BUFFER, lineColorBufferObject);
		gl.vertexAttribPointer(lineShader.colorAttribute, lineColorBufferObject.itemSize, gl.FLOAT, false, 0, 0);

		mvpMatrix = mat4.create();
		// This multiplies the modelview matrix by the projection matrix, and stores the result in the MVP matrix
		// (which now contains model * view * projection).
		mat4.multiply(mvpMatrix, projectionMatrix, modelMatrix);

		var dimCount = __.dimensions.length;
		gl.uniformMatrix4fv(lineShader.mvpMatrixUniform, false, mvpMatrix);
//		data.map(function(d, i) {
		gl.drawArrays(gl.LINE_STRIP, 0, linePositionBufferObject.numItems);
//		});

	}

//	Draws splats from the given vertex data.
	function drawSplats(data) {

		uploadData(data);
//		uploadColors(data);

		gl.useProgram(splatShader);

		// Pass in the position information
		gl.enableVertexAttribArray(splatShader.positionAttribute);
		gl.bindBuffer(gl.ARRAY_BUFFER, linePositionBufferObject);
		gl.vertexAttribPointer(splatShader.positionAttribute, linePositionBufferObject.itemSize, gl.FLOAT, false, 0, 0);

		// Pass in the color information
		gl.enableVertexAttribArray(splatShader.colorAttribute);
		gl.bindBuffer(gl.ARRAY_BUFFER, lineColorBufferObject);
		gl.vertexAttribPointer(splatShader.colorAttribute, lineColorBufferObject.itemSize, gl.FLOAT, false, 0, 0);

		// Pass in the density parameter information
		gl.enableVertexAttribArray(splatShader.densityAttribute);
		gl.bindBuffer(gl.ARRAY_BUFFER, densityParameterBufferObject);
		gl.vertexAttribPointer(splatShader.densityAttribute, densityParameterBufferObject.itemSize, gl.FLOAT, false, 0, 0);

		mvpMatrix = mat4.create();
		// This multiplies the modelview matrix by the projection matrix, and stores the result in the MVP matrix
		// (which now contains model * view * projection).
		mat4.multiply(mvpMatrix, projectionMatrix, modelMatrix);

		gl.uniformMatrix4fv(splatShader.mvpMatrixUniform, false, mvpMatrix);
		gl.uniform1f(splatShader.variance, __.renderer.variance);
		gl.uniform1i(splatShader.normalize, __.renderer.normalize ? 1 : 0);

		gl.drawArrays(gl.TRIANGLES, 0, linePositionBufferObject.numItems);
	}


	function uploadData(data) {

		// try to autodetect dimensions and create scales
		if (!__.dimensions.length) pc.detectDimensions();
		if (!(__.dimensions[0] in yscale)) pc.autoscale();

		// shortcut
		var p = difference(__.dimensions, __.hideAxis);

		var sampleCount = data.length;
		var dimCount = p.length;
		var lineCount = (dimCount - 1) * sampleCount;

		var vertexCount = 0;
		var j = 0;

		// LINES
		if (__.renderer.variance <= 0.001) {

			vertexCount = dimCount * sampleCount;

			// two values per vertex (x,y)
			linePositions = new Float32Array(vertexCount * 2);

			for (var s = 0; s < sampleCount; s++) {
				// vertices
				if (!(s % 2)) {	// left to right
					for (var d = 0; d < dimCount; d++) {
						var ip = yscale[p[d]](data[s][p[d]]);

						linePositions[j + 0] = position(p[d]);
						linePositions[j + 1] = ip;

						j += 2;
					}
				} else {		// right to left
					for (var d = dimCount - 1; d >= 0; d--) {
						var ip = yscale[p[d]](data[s][p[d]]);

						linePositions[j + 0] = position(p[d]);
						linePositions[j + 1] = ip;

						j += 2;
					}
				}
				
			}

			lineColors = new Float32Array(vertexCount * 4);

			// color
			j = 0;
			data.forEach(function(x) {
				var color = d3.rgb(d3.functor(__.color)(x));
				for (var d = 0; d < dimCount; d++) {
					lineColors.set([color.r/255.0, color.g/255.0, color.b/255.0, config.alpha], j);
					j += 4;
				}
			});

			// SPLATS
		} else {

			// WebGL doesn't support QUADS, use two triangles instead
			var triangleCount = lineCount * 2;
			vertexCount = triangleCount * 3;

//			var offset = uncertainty / 2;
			linePositions = new Float32Array(vertexCount * 2);
			// two values per vertex (x,y)
			for (var s = 0; s < sampleCount; s++) {
				for (var d = 0; d < dimCount - 1; d++) {

					var lefttop = h();
					var leftbottom = 0;
					var righttop = h();
					var rightbottom = 0;

					// compute vertices of two triangles to get a single quad
					// tl
					linePositions[j + 0] = position(p[d]);
					linePositions[j + 1] = lefttop;
					// tr
					linePositions[j + 2] = position(p[d + 1]);
					linePositions[j + 3] = righttop;
					// br
					linePositions[j + 4] = position(p[d + 1]);
					linePositions[j + 5] = rightbottom;
					// br
					linePositions[j + 6] = linePositions[j + 4];
					linePositions[j + 7] = linePositions[j + 5];
					// bl
					linePositions[j + 8] = position(p[d]);
					linePositions[j + 9] = leftbottom;
					// tl
					linePositions[j + 10] = linePositions[j + 0];
					linePositions[j + 11] = linePositions[j + 1];

					j += 12;
				}
			}

			// Compute splat density parameters
			// REMARK: might be more memory efficient using index buffers, as densityParameters can
			// only take values of 1 and 0.
			densityParameterBufferObject = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, densityParameterBufferObject);
			densityParameterBufferObject.itemSize = 3;
			densityParameterBufferObject.numItems = vertexCount;
			densityParameters = new Float32Array(densityParameterBufferObject.numItems * densityParameterBufferObject.itemSize);

			// two values per vertex (a,b)
			var j = 0;
			for (var s = 0; s < sampleCount; s++) {
				for (var d = 0; d < dimCount - 1; d++) {
					var leftip = yscale[p[d]](data[s][p[d]]) / h();
					var rightip = yscale[p[d + 1]](data[s][p[d + 1]]) / h();

					// tl
					densityParameters[j + 0] = 0;
					densityParameters[j + 1] = 1;
					densityParameters[j + 2] = leftip;

					// tr
					densityParameters[j + 3] = 1;
					densityParameters[j + 4] = 1;
					densityParameters[j + 5] = rightip;

					// br
					densityParameters[j + 6] = 1;
					densityParameters[j + 7] = 0;
					densityParameters[j + 8] = rightip;

					// br
					densityParameters[j + 9] = 1;
					densityParameters[j + 10] = 0;
					densityParameters[j + 11] = rightip;

					// bl
					densityParameters[j + 12] = 0;
					densityParameters[j + 13] = 0;
					densityParameters[j + 14] = leftip;

					// tl
					densityParameters[j + 15] = 0;
					densityParameters[j + 16] = 1;
					densityParameters[j + 17] = leftip;

					j += 18;
				}
			}

			gl.bufferData(gl.ARRAY_BUFFER, densityParameters, gl.STATIC_DRAW);

			lineColors = new Float32Array(vertexCount * 4);

			// color
			j = 0;
			for (var x = 0; x < data.length; ++x) {
				var color = d3.rgb(d3.functor(__.color)(data[x]));
				for (var d = 0; d < dimCount - 1; d++) {
					for (var vertex = 0; vertex < 6; vertex++) {
						lineColors.set([color.r/255.0, color.g/255.0, color.b/255.0, config.alpha], j);
						j += 4;
					}
				}
			}
		}

		// Create buffers in OpenGL's working memory.
		linePositionBufferObject = gl.createBuffer();
		linePositionBufferObject.itemSize = 2;
		linePositionBufferObject.numItems = vertexCount;
		linePositionBufferObject.dimCount = dimCount;
		gl.bindBuffer(gl.ARRAY_BUFFER, linePositionBufferObject);
		gl.bufferData(gl.ARRAY_BUFFER, linePositions, gl.STATIC_DRAW);

		lineColorBufferObject = gl.createBuffer();
		lineColorBufferObject.itemSize = 4;
		lineColorBufferObject.numItems = vertexCount;
		gl.bindBuffer(gl.ARRAY_BUFFER, lineColorBufferObject);
		gl.bufferData(gl.ARRAY_BUFFER, lineColors, gl.STATIC_DRAW);

	}


	function uploadColors(data) {

		// try to autodetect dimensions and create scales
		if (!__.dimensions.length) pc.detectDimensions();
		if (!(__.dimensions[0] in yscale)) pc.autoscale();

		// shortcut
		var p = difference(__.dimensions, __.hideAxis);

		var sampleCount = data.length;
		var dimCount = p.length;
		var vertexCount = dimCount * sampleCount;

		lineColors = new Float32Array(vertexCount * 4);

		// color
		j = 0;
		data.forEach(function(x) {
			var color = d3.rgb(d3.functor(__.color)(x));
			for (var d = 0; d < dimCount; d++) {
				lineColors.set([color.r/255.0, color.g/255.0, color.b/255.0, 1.0], j);
				j += 4;
			}
		});

		lineColorBufferObject = gl.createBuffer();
		lineColorBufferObject.itemSize = 4;
		lineColorBufferObject.numItems = vertexCount;
		gl.bindBuffer(gl.ARRAY_BUFFER, lineColorBufferObject);
		gl.bufferData(gl.ARRAY_BUFFER, lineColors, gl.STATIC_DRAW);

	}

	function index(row, col) {
		return row * __.dimensions.length + col;
	}

	function checkError() {
		var error = gl.getError();

		if (error) {
			throw ("GLerror: " + error);
		}
	}

//	convert color in hex (#RRGGBB) to an array with alpha = 1 ([R,G,B,1]),
//	where each color is in [0,1]
	function hexToRgb(hex) {
		var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
		return result ? [parseInt(result[1], 16) / 255.0, parseInt(result[2], 16) / 255.0, parseInt(result[3], 16) / 255.0, 1.0] : null;
	}

	function difference(arr, others) {
		return arr.filter(function(elem) { return others.indexOf(elem) === -1; })
	};

	function setupShaders() {
		/* Configure shaders */

		var vertexShader = loadShader(shaders.LINES_VS, gl.VERTEX_SHADER);
		var fragmentShader = loadShader(shaders.LINES_FS, gl.FRAGMENT_SHADER);

		// Create a program object and store the handle to it.
		lineShader = linkProgram(vertexShader, fragmentShader);

		lineShader.positionAttribute = gl.getAttribLocation(lineShader, "vertex");
		lineShader.colorAttribute = gl.getAttribLocation(lineShader, "color");
		lineShader.mvpMatrixUniform = gl.getUniformLocation(lineShader, "uMVPMatrix");

		vertexShader = loadShader(shaders.SPLATS_VS, gl.VERTEX_SHADER);
		fragmentShader = loadShader(shaders.SPLATS_FS, gl.FRAGMENT_SHADER);

		// Create a program object and store the handle to it.
		splatShader = linkProgram(vertexShader, fragmentShader);

		splatShader.positionAttribute = gl.getAttribLocation(splatShader, "vertex");
		splatShader.colorAttribute = gl.getAttribLocation(splatShader, "color");
		splatShader.densityAttribute = gl.getAttribLocation(splatShader, "v_texture");	
		splatShader.mvpMatrixUniform = gl.getUniformLocation(splatShader, "uMVPMatrix");
		splatShader.variance = gl.getUniformLocation(splatShader, "var");
		splatShader.normalize = gl.getUniformLocation(splatShader, "normalize");

		// FBO Shader
		vertexShader = loadShader(shaders.FBO_VS, gl.VERTEX_SHADER);
		fragmentShader = loadShader(shaders.FBO_FS, gl.FRAGMENT_SHADER);

		fboShader = linkProgram(vertexShader, fragmentShader);

		fboShader.vertex = gl.getAttribLocation(fboShader, "vertex");
		fboShader.texture = gl.getUniformLocation(fboShader, "texture");
		fboShader.min = gl.getUniformLocation(fboShader, "min");
		fboShader.max = gl.getUniformLocation(fboShader, "max");

		vertexShader = loadShader(shaders.FBO_VS, gl.VERTEX_SHADER);
		fragmentShader = loadShader(shaders.ENCODE_FS, gl.FRAGMENT_SHADER);

		encodeShader = linkProgram(vertexShader, fragmentShader);
		encodeShader.vertex = gl.getAttribLocation(encodeShader, "vertex");	
		encodeShader.texture = gl.getUniformLocation(encodeShader, "texture");	
	}

//	Helper function to link a program
	function linkProgram(vertexShader, fragmentShader) {
		// Create a program object and store the handle to it.
		var programHandle = gl.createProgram();

		if (programHandle != 0) {
			// Bind the vertex shader to the program.
			gl.attachShader(programHandle, vertexShader);

			// Bind the fragment shader to the program.
			gl.attachShader(programHandle, fragmentShader);

			// Link the two shaders together into a program.
			gl.linkProgram(programHandle);

			// Get the link status.
			var linked = gl.getProgramParameter(programHandle, gl.LINK_STATUS);

			// If the link failed, delete the program.
			if (!linked) {
				gl.deleteProgram(programHandle);
				programHandle = 0;
			}
		}

		if (programHandle == 0) {
			throw ("Error creating program.");
		}

		return programHandle;
	}

//	Helper function to load a shader
	function loadShader(shaderSource, type) {
		var shaderHandle = gl.createShader(type);
		var error;

		if (shaderHandle != 0) {

			if (!shaderSource) {
				throw ("Error: shader script not found");
			}

			// Pass in the shader source.
			gl.shaderSource(shaderHandle, shaderSource);

			// Compile the shader.
			gl.compileShader(shaderHandle);

			// Get the compilation status.
			var compiled = gl.getShaderParameter(shaderHandle, gl.COMPILE_STATUS);

			// If the compilation failed, delete the shader.
			if (!compiled) {
				error = gl.getShaderInfoLog(shaderHandle);
				gl.deleteShader(shaderHandle);
				shaderHandle = 0;
			}
		}

		if (shaderHandle == 0) {
			throw ("Error creating shader: " + error);
		}

		return shaderHandle;
	}

	shaders.SPLATS_VS = '\n\
		precision highp float;\n\
		\n\
		attribute vec4 vertex;\n\
		attribute vec3 v_texture;\n\
		attribute vec4 color;\n\
		\n\
		uniform mat4 uMVPMatrix;\n\
		\n\
		varying vec3 f_texture;\n\
		varying vec4 f_color;\n\
		\n\
		void main(void) {\n\
		gl_Position = uMVPMatrix * vec4(vertex.xy, 0.0, 1.0);\n\
		f_texture = v_texture;\n\
		f_color = color;\n\
		}';

	shaders.SPLATS_FS = '\n\
		precision highp float;\n\
		const float pi = 3.14159265;\n\
		uniform float var;\n\
		uniform int normalize;\n\
		varying vec3 f_texture;\n\
		varying vec4 f_color;\n\
		\n\
		void main(void)	{\n\
		float a = f_texture.x;\n\
		float b = f_texture.y;\n\
		float mu = f_texture.z;\n\
		float sd = var * var;\n\
		float sigma = pow(1.0 - a, 2.0) * sd + pow(a, 2.0) * sd;\n\
		float density = 1.0/sqrt(2.0*pi*sigma) * exp(-pow(b-mu,2.0)/(2.0*sigma));\n\
		if (normalize == 0) {\n\
		density = density * f_color.a;\n\
		gl_FragColor = vec4(f_color.r, f_color.g, f_color.b, density);\n\
		} else {\n\
		gl_FragColor = vec4(density);// * density;\n\
		}\n\
		//gl_FragColor = f_color.rgba;\n\
		}';

	shaders.LINES_VS = '\n\
		precision mediump float;\n\
		\n\
		attribute vec4 vertex;\n\
		attribute vec4 color;\n\
		varying vec4 f_color;\n\
		uniform mat4 uMVPMatrix;\n\
		\n\
		void main(void) {\n\
		gl_Position = uMVPMatrix * vec4(vertex.xy, 0.0, 1.0);\n\
		f_color = color;\n\
		}';

	shaders.LINES_FS = '\n\
		precision mediump float;\n\
		varying vec4 f_color;\n\
		\n\
		void main(void)	{\n\
		gl_FragColor = f_color.rgba;\n\
		}';

	shaders.FBO_VS = '\n\
		precision highp float;\n\
		attribute vec4 vertex;\n\
		varying vec2 coord;\n\
		void main() {\n\
		coord = vertex.xy * 0.5 + 0.5;\n\
		gl_Position = vec4(vertex.xyz, 1.0);\n\
		}';

	shaders.FBO_FS = '\n\
		precision highp float;\n\
		varying vec2 coord;\n\
		uniform sampler2D texture;\n\
		uniform float min;\n\
		uniform float max;\n\
		\n\
		void main(void)	{\n\
		vec4 data = texture2D(texture, coord);\n\
		gl_FragColor = vec4( 1.0 - (data.r-min)/(max-min) );\n\
		}';

//	inspired by: http://concord-consortium.github.io/lab/experiments/webgl-gpgpu/script.js
	shaders.ENCODE_FS = '\
		precision highp float;\n\
		uniform sampler2D texture;\
		varying vec2 coord;\
		float shift_right(float v, float amt) {\
		v = floor(v) + 0.5;\
		return floor(v / exp2(amt));\
		}\
		float shift_left(float v, float amt) {\
		return floor(v * exp2(amt) + 0.5);\
		}\
		\
		float mask_last(float v, float bits) {\
		return mod(v, shift_left(1.0, bits));\
		}\
		float extract_bits(float num, float from, float to) {\
		from = floor(from + 0.5);\
		to = floor(to + 0.5);\
		return mask_last(shift_right(num, from), to - from);\
		}\
		vec4 encode_float(float val) {\
		if (val == 0.0)\
		return vec4(0, 0, 0, 0);\
		float sign = val > 0.0 ? 0.0 : 1.0;\
		val = abs(val);\
		float exponent = floor(log2(val));\
		float biased_exponent = exponent + 127.0;\
		float fraction = ((val / exp2(exponent)) - 1.0) * 8388608.0;\
		\
		float t = biased_exponent / 2.0;\
		float last_bit_of_biased_exponent = fract(t) * 2.0;\
		float remaining_bits_of_biased_exponent = floor(t);\
		\
		float byte4 = extract_bits(fraction, 0.0, 8.0) / 255.0;\
		float byte3 = extract_bits(fraction, 8.0, 16.0) / 255.0;\
		float byte2 = (last_bit_of_biased_exponent * 128.0 + extract_bits(fraction, 16.0, 23.0)) / 255.0;\
		float byte1 = (sign * 128.0 + remaining_bits_of_biased_exponent) / 255.0;\
		return vec4(byte4, byte3, byte2, byte1);\
		}\
		void main() {\
		vec4 data = texture2D(texture, coord);\
		gl_FragColor = encode_float(data.r);\
		}\
		';

	renderer.types["webgl"] = {
			install: install,
			resize: resize,
			uninstall: uninstall
	}

})();