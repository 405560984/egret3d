(function (global, factory) {
	typeof exports === 'object' && typeof module !== 'undefined' ? module.exports = factory() :
		typeof define === 'function' && define.amd ? define(factory) :
			(global.Stats = factory());
}(this, (function () {
	'use strict';

	/**
	 * @author mrdoob / http://mrdoob.com/
	 */

	var Stats = function () {

		var mode = 0;

		var container = document.createElement('div');
		container.style.cssText = 'position:fixed;top:0;left:0;cursor:pointer;opacity:0.9;z-index:10000';
		container.addEventListener('click', function (event) {

			event.preventDefault();
			showPanel(++mode % container.children.length);

		}, false);

		//

		function addPanel(panel) {

			container.appendChild(panel.dom);
			return panel;

		}

		function showPanel(id) {

			for (var i = 0; i < container.children.length; i++) {

				container.children[i].style.display = i === id ? 'block' : 'none';

			}

			mode = id;

		}

		//

		var beginTime = (performance || Date).now();
		var prevTickTime = beginTime;
		var prevFrameTime = beginTime;
		var frames = 0;
		var ticks = 0;

		var fpsPanel = addPanel(new Stats.Panel('FPS', '#0ff', '#002'));
		var tpsPanel = addPanel(new Stats.Panel('TPS', '#ff0', '#220'));
		var msPanel = addPanel(new Stats.Panel('MS', '#0f0', '#020'));

		if (self.performance && self.performance.memory) {

			var memPanel = addPanel(new Stats.Panel('MB', '#f08', '#201'));

		}

		showPanel(0);

		return {

			REVISION: 16,

			dom: container,

			addPanel: addPanel,
			showPanel: showPanel,

			begin: function () {

				beginTime = (performance || Date).now();

			},

			end: function () {

				ticks++;

				var time = (performance || Date).now();

				msPanel.update(time - beginTime, 200);

				if (time > prevTickTime + 1000) {

					tpsPanel.update((ticks * 1000) / (time - prevTickTime), 100);

					prevTickTime = time;
					ticks = 0;

					if (memPanel) {

						var memory = performance.memory;
						memPanel.update(memory.usedJSHeapSize / 1048576, memory.jsHeapSizeLimit / 1048576);

					}

				}

				return time;

			},

			update: function () {

				beginTime = this.end();

			},

			onFrame: function() {
				frames++;
				var time = (performance || Date).now();
				if (time > prevFrameTime + 1000) {
					fpsPanel.update((frames * 1000) / (time - prevFrameTime), 100);
					prevFrameTime = time;
					frames = 0;
				}
				return time;
			},

			// Backwards Compatibility

			domElement: container,
			setMode: showPanel

		};

	};

	Stats.Panel = function (name, fg, bg) {

		var min = Infinity, max = 0, round = Math.round;
		var PR = round(window.devicePixelRatio || 1);
		var W = 90;
		var H = 48;
		var B = 2;
		var DG = 15;

		var WIDTH = W * PR, HEIGHT = H * PR,
			TEXT_X = B * PR, TEXT_Y = B * PR,
			GRAPH_X = B * PR, GRAPH_Y = (B + DG) * PR,
			GRAPH_WIDTH = (W - B * 2) * PR, GRAPH_HEIGHT = (H - B * 2 - DG) * PR;

		var canvas = document.createElement('canvas');
		canvas.width = WIDTH;
		canvas.height = HEIGHT;
		canvas.style.cssText = `width:${W}px;height:${H}px`;

		var context = canvas.getContext('2d');
		context.font = 'bold ' + (9 * PR) + 'px Helvetica,Arial,sans-serif';
		context.textBaseline = 'top';

		context.fillStyle = bg;
		context.fillRect(0, 0, WIDTH, HEIGHT);

		context.fillStyle = fg;
		context.fillText(name, TEXT_X, TEXT_Y);
		context.fillRect(GRAPH_X, GRAPH_Y, GRAPH_WIDTH, GRAPH_HEIGHT);

		context.fillStyle = bg;
		context.globalAlpha = 0.9;
		context.fillRect(GRAPH_X, GRAPH_Y, GRAPH_WIDTH, GRAPH_HEIGHT);

		return {

			dom: canvas,

			update: function (value, maxValue) {

				min = Math.min(min, value);
				max = Math.max(max, value);

				context.fillStyle = bg;
				context.globalAlpha = 1;
				context.fillRect(0, 0, WIDTH, GRAPH_Y);
				context.fillStyle = fg;
				context.fillText(round(value) + ' ' + name + ' (' + round(min) + '-' + round(max) + ')', TEXT_X, TEXT_Y);

				context.drawImage(canvas, GRAPH_X + PR, GRAPH_Y, GRAPH_WIDTH - PR, GRAPH_HEIGHT, GRAPH_X, GRAPH_Y, GRAPH_WIDTH - PR, GRAPH_HEIGHT);

				context.fillRect(GRAPH_X + GRAPH_WIDTH - PR, GRAPH_Y, PR, GRAPH_HEIGHT);

				context.fillStyle = bg;
				context.globalAlpha = 0.9;
				context.fillRect(GRAPH_X + GRAPH_WIDTH - PR, GRAPH_Y, PR, round((1 - (value / maxValue)) * GRAPH_HEIGHT));

			}

		};

	};

	return Stats;

})));
