// You can set the following variables before loading this script:
//
// var netdataStopDygraph = 1;			// do not use dygraph
// var netdataStopSparkline = 1;		// do not use sparkline
// var netdataStopPeity = 1;			// do not use peity
//
// You can also set the default netdata server, using the following.
// When this variable is not set, we assume the page is hosted on your
// netdata server already.
// var netdataServer = "http://yourhost:19999"; // set your NetData server

// --------------------------------------------------------------------------------------------------------------------
// For google charts you need this in your page:
//	<script type="text/javascript" src="https://www.google.com/jsapi"></script>
//	<script type='text/javascript'>google.load('visualization', '1.1', {'packages':['corechart', 'controls']});</script>

(function(window)
{
	// fix IE bug with console
	if(!window.console){ window.console = {log: function(){} }; }

	var NETDATA = window.NETDATA || {};

	// ----------------------------------------------------------------------------------------------------------------
	// Detect the netdata server

	// http://stackoverflow.com/questions/984510/what-is-my-script-src-url
	// http://stackoverflow.com/questions/6941533/get-protocol-domain-and-port-from-url
	NETDATA._scriptSource = function(scripts) {
		var script = null, base = null;

		if(typeof document.currentScript != 'undefined') {
			script = document.currentScript;
		}
		else {
			var all_scripts = document.getElementsByTagName('script');
			script = all_scripts[all_scripts.length - 1];
		}

		if (script.getAttribute.length != 'undefined')
			script = script.src;
		else
			script = script.getAttribute('src', -1);

		var link = document.createElement('a');
		link.setAttribute('href', script);

		if(!link.protocol || !link.hostname) return null;

		base = link.protocol;
		if(base) base += "//";
		base += link.hostname;

		if(link.port) base += ":" + link.port;
		base += "/";

		return base;
	};

	if(typeof netdataServer != 'undefined')
		NETDATA.serverDefault = netdataServer + "/";
	else
		NETDATA.serverDefault = NETDATA._scriptSource();

	NETDATA.jQuery       = NETDATA.serverDefault + 'lib/jquery-1.11.3.min.js';
	NETDATA.peity_js     = NETDATA.serverDefault + 'lib/jquery.peity.min.js';
	NETDATA.sparkline_js = NETDATA.serverDefault + 'lib/jquery.sparkline.min.js';
	NETDATA.dygraph_js   = NETDATA.serverDefault + 'lib/dygraph-combined.js';
	NETDATA.raphael_js   = NETDATA.serverDefault + 'lib/raphael-min.js';
	NETDATA.morris_js    = NETDATA.serverDefault + 'lib/morris.min.js';
	NETDATA.morris_css   = NETDATA.serverDefault + 'css/morris.css';
	NETDATA.google_js    = 'https://www.google.com/jsapi';
	NETDATA.colors	= [ '#3366CC', '#DC3912', '#FF9900', '#109618', '#990099', '#3B3EAC', '#0099C6',
						'#DD4477', '#66AA00', '#B82E2E', '#316395', '#994499', '#22AA99', '#AAAA11',
						'#6633CC', '#E67300', '#8B0707', '#329262', '#5574A6', '#3B3EAC' ];

	// ----------------------------------------------------------------------------------------------------------------
	// the defaults for all charts

	NETDATA.chartDefaults = {
		host: NETDATA.serverDefault,	// the server to get data from
		width: '100%',					// the chart width
		height: '100%',					// the chart height
		library: 'dygraph',				// the graphing library to use
		method: 'average',				// the grouping method
		before: 0,						// panning
		after: -600,					// panning
		pixels_per_point: 1				// the detail of the chart
	}

	NETDATA.options = {
		targets: null,				
		updated_dom: 1,
		debug: 1,
		last_paused: 0,

		current: {
			pixels_per_point: 1,
			idle_between_charts: 100,
			idle_between_loops: 500,
			fast_render_timeframe: 200 // render continously for these many ms
		}
	}

	if(NETDATA.options.debug) console.log('welcome to NETDATA');


	// ----------------------------------------------------------------------------------------------------------------
	// Error Handling

	NETDATA.errorCodes = {
		100: { message: "Cannot load chart library", alert: true },
		101: { message: "Cannot load jQuery", alert: true },
		402: { message: "Chart library not found", alert: false },
		403: { message: "Chart library not enabled/is failed", alert: false },
		404: { message: "Chart not found", alert: false }
	};
	NETDATA.errorLast = {
		code: 0,
		message: "",
		datetime: 0
	};

	NETDATA.error = function(code, msg) {
		NETDATA.errorLast.code = code;
		NETDATA.errorLast.message = msg;
		NETDATA.errorLast.datetime = new Date().getTime();

		console.log("ERROR " + code + ": " + NETDATA.errorCodes[code].message + ": " + msg);

		if(NETDATA.errorCodes[code].alert)
			alert("ERROR " + code + ": " + NETDATA.errorCodes[code].message + ": " + msg);
	}

	NETDATA.errorReset = function() {
		NETDATA.errorLast.code = 0;
		NETDATA.errorLast.message = "You are doing fine!";
		NETDATA.errorLast.datetime = 0;
	}

	NETDATA.messageInABox = function(element, message) {
		self = $(element);

		bgcolor = ""
		if(NETDATA.options.debug)
			bgcolor = " background-color: lightgrey;";

		element.innerHTML = '<div style="overflow: hidden;' + bgcolor + ' width: 100%; height: 100%;"><small>'
			+ message
			+ '</small></div>';

		self.data('created', false);
	}

	// ----------------------------------------------------------------------------------------------------------------
	// Load a script without jquery
	// This is used to load jquery - after it is loaded, we use jquery

	NETDATA._loadjQuery = function(callback) {
		if(typeof jQuery == 'undefined') {
			var script = document.createElement('script');
			script.type = 'text/javascript';
			script.async = true;
			script.src = NETDATA.jQuery;

			// script.onabort = onError;
			script.onerror = function(err, t) { NETDATA.error(101, NETDATA.jQuery); };
			if(typeof callback == "function")
				script.onload = callback;

			var s = document.getElementsByTagName('script')[0];
			s.parentNode.insertBefore(script, s);
		}
		else if(typeof callback == "function")
			callback();
	}

	NETDATA.generateChartDataURL = function() {
		self = $(this);

		var chart = self.data('chart');
		var host = self.data('host') || NETDATA.chartDefaults.host;
		var width = self.width();
		var height = self.height();
		var method = self.data('method') || NETDATA.chartDefaults.method;
		var after = self.data('after') || NETDATA.chartDefaults.after;
		var before = self.data('before') || NETDATA.chartDefaults.before;
		var library = self.data('chart-library') || NETDATA.chartDefaults.library;
		var dimensions = self.data('dimensions') || null;
		var pixels_per_point = self.data('pixels-per-point') || NETDATA.chartLibraries[library].pixels_per_point;

		// force an options provided detail
		if(pixels_per_point < NETDATA.options.current.pixels_per_point)
			pixels_per_point = NETDATA.options.current.pixels_per_point

		var points = self.data('points') || Math.round(width / pixels_per_point);

		// build the data URL
		var url = host + chart.data_url;
		url += "&format="  + NETDATA.chartLibraries[library].format;
		url += "&points="  + points.toString();
		url += "&options=" + NETDATA.chartLibraries[library].options;
		url += "&group="   + method;

		if(after)
			url += "&after="  + after.toString();

		if(before)
			url += "&before=" + before.toString();

		if(dimensions)
			url += "&dimensions=" + dimensions;

		self.data('calculated-width', width)
			.data('calculated-height', height)
			.data('calculated-points', points)
			.data('calculated-url', url);

		if(NETDATA.options.debug) console.log('generateChartDataURL(): ' + url + ' WxH:' + width + 'x' + height + ' points: ' + points + ' library: ' + library);
		return url;
	}

	NETDATA.validateDomCharts = function(targets, index, callback) {
		if(NETDATA.options.debug) console.log('validateDomCharts() working on ' + index);

		var target = targets.get(index);
		if(target == null) {
			if(NETDATA.options.debug) console.log('validateDomCharts(): all ' + (index - 1) + ' charts parsed.');
			if(typeof callback == 'function') callback();
		}
		else {
			var self = $(target);
			if(!self.data('prepared')) {
				self.data('prepared', true)
					.data('updated', 0)
					.data('created', false)
					.data('enabled', false);

				var id = self.data('netdata');
				var host = self.data('host') || NETDATA.chartDefaults.host;
				var library = self.data('chart-library') || NETDATA.chartDefaults.library;

				if(NETDATA.options.debug) console.log('validateDomCharts() parsing ' + id + ' of type ' + library);

				if(typeof NETDATA.chartLibraries[library] == 'undefined') {
					NETDATA.error(402, library);
					NETDATA.messageInABox(target, 'chart library "' + library + '" is not found');
					NETDATA.validateDomCharts(targets, ++index, callback);
				}
				else if(!NETDATA.chartLibraries[library].enabled) {
					NETDATA.error(403, library);
					NETDATA.messageInABox(target, 'chart library "' + library + '" is not enabled');
					NETDATA.validateDomCharts(targets, ++index, callback);
				}
				else if(!NETDATA.chartLibraries[library].initialized) {
					self.data('prepared', false);
					NETDATA.chartLibraries[library].initialize(function() {
						NETDATA.validateDomCharts(targets, index, callback);
					});
				}
				else {
					var url = host + "/api/v1/chart?chart=" + id;

					$.ajax( {
						url:  url,
						crossDomain: true
					})
					.done(function(chart) {
						self.data('chart', chart)
							.data('update-every', chart.update_every * 1000)
							.data('enabled', true)
							.data('host', host)
							.data('chart-library', library);
					})
					.fail(function() {
						NETDATA.error(404, url);
						NETDATA.messageInABox(target, 'chart "' + id + '" not found on url "' + url + '"');
					})
					.always(function() {
						NETDATA.validateDomCharts(targets, ++index, callback);
					});
				}
			}
			else {
				NETDATA.validateDomCharts(targets, ++index, callback);
			}
		}
	}

	NETDATA.sizeDomCharts = function(targets, index, callback) {
		// this is used to quickly size all charts to their size

		if(NETDATA.options.debug) console.log('sizeDomCharts() working on ' + index);

		var target = targets.get(index);
		if(target == null) {
			if(NETDATA.options.debug) console.log('sizeDomCharts(): all ' + (index - 1) + ' charts sized.');
			if(typeof callback == 'function') callback();
		}
		else {
			var self = $(target);

			var id = self.data('netdata');
			var width = self.data('width') || NETDATA.chartDefaults.width;
			var height = self.data('height') || NETDATA.chartDefaults.height;

			self.css('width', width)
				.css('height', height)
				.css('display', 'inline-block')
				.css('overflow', 'hidden');

			NETDATA.messageInABox(target, 'chart "' + id + '" is loading...');
			NETDATA.sizeDomCharts(targets, ++index, callback);
		}
	}

	NETDATA.domUpdated = function(callback) {
		NETDATA.options.updated_dom = 0;

		NETDATA.options.targets = $('div[data-netdata]').filter(':visible')
			.bind('create', function(event, data) {
				var self = $(this);
				
				if(NETDATA.options.debug)
					NETDATA.chartLibraries[self.data('chart-library')].create(this, data);
				else {
					try {
						NETDATA.chartLibraries[self.data('chart-library')].create(this, data);
					}
					catch(err) {
						NETDATA.messageInABox(this, 'chart "' + self.data('netdata') + '" failed to be created as ' + self.data('chart-library'));
						self.data('created', false);
					}
				}
			})
			.bind('update', function(event, data) {
				var self = $(this);
				if(NETDATA.options.debug)
					NETDATA.chartLibraries[self.data('chart-library')].update(this, data);
				else {
					try {
						NETDATA.chartLibraries[self.data('chart-library')].update(this, data);
					}
					catch(err) {
						NETDATA.messageInABox(this, 'chart "' + self.data('netdata') + '" failed to be updated as ' + self.data('chart-library'));
						self.data('created', false);
					}
				}
			});

		if(NETDATA.options.debug)
			console.log('DOM updated - there are ' + NETDATA.options.targets.length + ' charts on page.');

		NETDATA.sizeDomCharts(NETDATA.options.targets, 0, function() {
			NETDATA.validateDomCharts(NETDATA.options.targets, 0, callback);
		});
	}

	NETDATA.init = function() {
		// this should be called only once
		NETDATA.domUpdated(function() {
			NETDATA.chartRefresher(0);
		});
	}

	// ----------------------------------------------------------------------------------------------------------------

	//var chart = function() {
	//}

	//chart.prototype.color = function() {
	//	return 'red';
	//}

	//var c = new chart();
	//c.color();

	NETDATA.chartValuesDownloader = function(element, callback) {
		var self = $(element);
		var last = self.data('updated') || 0;
		var every = self.data('update-every') || 1;

		// check if this chart has to be refreshed now
		var now = new Date().getTime();
		if(last + every > now) {
			console.log(self.data('netdata') + ' too soon - skipping.');
			if(typeof callback == 'function') callback();
		}
		else if(!self.visible(true)) {
			console.log(self.data('netdata') + ' is NOT visible.');
			if(typeof callback == 'function') callback();
		}
		else {
			console.log(self.data('netdata') + ' is visible, downloading data...');
			$.ajax( {
				url: NETDATA.generateChartDataURL.call(element), // self.data('chart-url'),
				crossDomain: true
			})
			.then(function(data) {
				var started = new Date().getTime();

				if(self.data('created')) {
					console.log('updating ' + self.data('chart-library') + ' chart ' + self.data('netdata'));
					self.trigger('update', [data]);
					// NETDATA.chartLibraries[self.data('chart-library')].update(element, data);
				}
				else {
					console.log('creating ' + self.data('chart-library') + ' chart ' + self.data('netdata'));
					self.trigger('create', [data]);
					//NETDATA.chartLibraries[self.data('chart-library')].create(element, data);
					self.data('created', true);
				}

				var ended = new Date().getTime();
				self.data('updated', ended);

				var dt = ended - started;

				self.data('refresh-dt', dt);
				var element_name = self.data('dt-element-name') || null;
				if(element_name) {
					var element = document.getElementById(element_name) || null;
					if(element) {
						element.innerHTML = dt.toString();
					}
				}
			})
			.fail(function() {
				NETDATA.messageInABox(element, 'cannot download chart "' + self.data('netdata') + '" values from url "' + self.data('chart-url') + '"');
			})
			.always(function() {
				if(typeof callback == 'function') callback();
			});
		}
	};

	NETDATA.chartRefresher = function(index) {
		// if(NETDATA.options.debug) console.log('NETDATA.chartRefresher(<targets, ' + index + ')');

		now = new Date().getTime();

		if(NETDATA.options.updated_dom) {
			NETDATA.domUpdated(function() {
				NETDATA.chartRefresher(0);
			});
		}
		else {
			var target = NETDATA.options.targets.get(index);
			if(target == null) {
				if(NETDATA.options.debug) console.log('waiting to restart main loop...');
				NETDATA.options.last_paused = now;

				setTimeout(function() {
					NETDATA.chartRefresher(0);
				}, NETDATA.options.current.idle_between_loops);
			}
			else {
				var self = $(target);
				if(!self.data('enabled')) {
					NETDATA.chartRefresher(++index);
				}
				else {
					if(now - NETDATA.options.last_paused < NETDATA.options.current.fast_render_timeframe) {
						if(NETDATA.options.debug) console.log('fast rendering...');

						NETDATA.chartValuesDownloader(target, function() {
							NETDATA.chartRefresher(++index);
						});
					}
					else {
						if(NETDATA.options.debug) console.log('waiting for next refresh...');
						NETDATA.options.last_paused = now;

						setTimeout(function() {
							NETDATA.chartValuesDownloader(target, function() {
								NETDATA.chartRefresher(++index);
							});
						}, NETDATA.options.current.idle_between_charts);
					}
				}
			}
		}
	}

	NETDATA.guid = function() {
		function s4() {
			return Math.floor((1 + Math.random()) * 0x10000)
					.toString(16)
					.substring(1);
			}

			return s4() + s4() + '-' + s4() + '-' + s4() + '-' + s4() + '-' + s4() + s4() + s4();
	}

	// ----------------------------------------------------------------------------------------------------------------
	// piety

	NETDATA.peityInitialize = function(callback) {
		if(typeof netdataStopPeity == 'undefined') {
			$.getScript(NETDATA.peity_js)
				.done(function() {
					NETDATA.registerChartLibrary('peity', NETDATA.peity_js);
				})
				.fail(function() {
					NETDATA.error(100, NETDATA.peity_js);
				})
				.always(function() {
					if(typeof callback == "function")
						callback();
				})
		}
		else {
			NETDATA.chartLibraries.peity.enabled = false;
			if(typeof callback == "function")
				callback();
		}
	};

	NETDATA.peityChartUpdate = function(element, data) {
		var self = $(element);
		var instance = self.data('peity-instance');
		var ins = $(instance);
		ins.html(data);

		// peity.change() does not accept options
		// to pass width and height
		//ins.change();
		ins.peity('line', { width: self.data('calculated-width'), height: self.data('calculated-height') })
	}

	NETDATA.peityChartCreate = function(element, data) {
		var self = $(element);

		var uuid = NETDATA.guid();
		element.innerHTML = '<div id="' + uuid + '">' + data + '</div>';
		var instance = document.getElementById(uuid);
		var ins = $(instance);

		ins.peity('line', { width: self.data('calculated-width'), height: self.data('calculated-height') })

		self.data('peity-uuid', uuid)
			.data('peity-instance', instance)
			.data('created', true);
	}

	// ----------------------------------------------------------------------------------------------------------------
	// sparkline

	NETDATA.sparklineInitialize = function(callback) {
		if(typeof netdataStopSparkline == 'undefined') {
			$.getScript(NETDATA.sparkline_js)
				.done(function() {
					NETDATA.registerChartLibrary('sparkline', NETDATA.sparkline_js);
				})
				.fail(function() {
					NETDATA.error(100, NETDATA.sparkline_js);
				})
				.always(function() {
					if(typeof callback == "function")
						callback();
				})
		}
		else {
			NETDATA.chartLibraries.sparkline.enabled = false;
			if(typeof callback == "function") 
				callback();
		}
	};

	NETDATA.sparklineChartUpdate = function(element, data) {
		var self = $(element);
		var options = self.data('sparkline-options');
		options.width = self.data('calculated-width');
		options.height = self.data('calculated-height');
		self.sparkline(data, options);
	}

	NETDATA.sparklineChartCreate = function(element, data) {
		var self = $(element);
		var chart = self.data('chart');
		var type = self.data('sparkline-type') || 'line';
		var lineColor = self.data('sparkline-lineColor') || undefined;
		var fillColor = self.data('sparkline-fillColor') || (chart.chart_type == 'line')?'#FFF':undefined;
		var chartRangeMin = self.data('sparkline-chartRangeMin') || undefined;
		var chartRangeMax = self.data('sparkline-chartRangeMax') || undefined;
		var composite = self.data('sparkline-composite') || undefined;
		var enableTagOptions = self.data('sparkline-enableTagOptions') || undefined;
		var tagOptionPrefix = self.data('sparkline-tagOptionPrefix') || undefined;
		var tagValuesAttribute = self.data('sparkline-tagValuesAttribute') || undefined;
		var disableHiddenCheck = self.data('sparkline-disableHiddenCheck') || undefined;
		var defaultPixelsPerValue = self.data('sparkline-defaultPixelsPerValue') || undefined;
		var spotColor = self.data('sparkline-spotColor') || undefined;
		var minSpotColor = self.data('sparkline-minSpotColor') || undefined;
		var maxSpotColor = self.data('sparkline-maxSpotColor') || undefined;
		var spotRadius = self.data('sparkline-spotRadius') || undefined;
		var valueSpots = self.data('sparkline-valueSpots') || undefined;
		var highlightSpotColor = self.data('sparkline-highlightSpotColor') || undefined;
		var highlightLineColor = self.data('sparkline-highlightLineColor') || undefined;
		var lineWidth = self.data('sparkline-lineWidth') || undefined;
		var normalRangeMin = self.data('sparkline-normalRangeMin') || undefined;
		var normalRangeMax = self.data('sparkline-normalRangeMax') || undefined;
		var drawNormalOnTop = self.data('sparkline-drawNormalOnTop') || undefined;
		var xvalues = self.data('sparkline-xvalues') || undefined;
		var chartRangeClip = self.data('sparkline-chartRangeClip') || undefined;
		var xvalues = self.data('sparkline-xvalues') || undefined;
		var chartRangeMinX = self.data('sparkline-chartRangeMinX') || undefined;
		var chartRangeMaxX = self.data('sparkline-chartRangeMaxX') || undefined;
		var disableInteraction = self.data('sparkline-disableInteraction') || false;
		var disableTooltips = self.data('sparkline-disableTooltips') || false;
		var disableHighlight = self.data('sparkline-disableHighlight') || false;
		var highlightLighten = self.data('sparkline-highlightLighten') || 1.4;
		var highlightColor = self.data('sparkline-highlightColor') || undefined;
		var tooltipContainer = self.data('sparkline-tooltipContainer') || undefined;
		var tooltipClassname = self.data('sparkline-tooltipClassname') || undefined;
		var tooltipFormat = self.data('sparkline-tooltipFormat') || undefined;
		var tooltipPrefix = self.data('sparkline-tooltipPrefix') || undefined;
		var tooltipSuffix = self.data('sparkline-tooltipSuffix') || ' ' + chart.units;
		var tooltipSkipNull = self.data('sparkline-tooltipSkipNull') || true;
		var tooltipValueLookups = self.data('sparkline-tooltipValueLookups') || undefined;
		var tooltipFormatFieldlist = self.data('sparkline-tooltipFormatFieldlist') || undefined;
		var tooltipFormatFieldlistKey = self.data('sparkline-tooltipFormatFieldlistKey') || undefined;
		var numberFormatter = self.data('sparkline-numberFormatter') || function(n){ return n.toFixed(2); };
		var numberDigitGroupSep = self.data('sparkline-numberDigitGroupSep') || undefined;
		var numberDecimalMark = self.data('sparkline-numberDecimalMark') || undefined;
		var numberDigitGroupCount = self.data('sparkline-numberDigitGroupCount') || undefined;
		var animatedZooms = self.data('sparkline-animatedZooms') || false;

		var options = {
			type: type,
			lineColor: lineColor,
			fillColor: fillColor,
			chartRangeMin: chartRangeMin,
			chartRangeMax: chartRangeMax,
			composite: composite,
			enableTagOptions: enableTagOptions,
			tagOptionPrefix: tagOptionPrefix,
			tagValuesAttribute: tagValuesAttribute,
			disableHiddenCheck: disableHiddenCheck,
			defaultPixelsPerValue: defaultPixelsPerValue,
			spotColor: spotColor,
			minSpotColor: minSpotColor,
			maxSpotColor: maxSpotColor,
			spotRadius: spotRadius,
			valueSpots: valueSpots,
			highlightSpotColor: highlightSpotColor,
			highlightLineColor: highlightLineColor,
			lineWidth: lineWidth,
			normalRangeMin: normalRangeMin,
			normalRangeMax: normalRangeMax,
			drawNormalOnTop: drawNormalOnTop,
			xvalues: xvalues,
			chartRangeClip: chartRangeClip,
			chartRangeMinX: chartRangeMinX,
			chartRangeMaxX: chartRangeMaxX,
			disableInteraction: disableInteraction,
			disableTooltips: disableTooltips,
			disableHighlight: disableHighlight,
			highlightLighten: highlightLighten,
			highlightColor: highlightColor,
			tooltipContainer: tooltipContainer,
			tooltipClassname: tooltipClassname,
			tooltipChartTitle: chart.title,
			tooltipFormat: tooltipFormat,
			tooltipPrefix: tooltipPrefix,
			tooltipSuffix: tooltipSuffix,
			tooltipSkipNull: tooltipSkipNull,
			tooltipValueLookups: tooltipValueLookups,
			tooltipFormatFieldlist: tooltipFormatFieldlist,
			tooltipFormatFieldlistKey: tooltipFormatFieldlistKey,
			numberFormatter: numberFormatter,
			numberDigitGroupSep: numberDigitGroupSep,
			numberDecimalMark: numberDecimalMark,
			numberDigitGroupCount: numberDigitGroupCount,
			animatedZooms: animatedZooms,
			width: self.data('calculated-width'),
			height: self.data('calculated-height')
		};

		var uuid = NETDATA.guid();
		element.innerHTML = '<div style="display: inline-block; position: relative;" id="' + uuid + '"></div>';
		var div = document.getElementById(uuid);

		self.sparkline(data, options);
		self.data('sparkline-options', options)
		.data('uuid', uuid)
		.data('created', true);
	};

	// ----------------------------------------------------------------------------------------------------------------
	// dygraph

	NETDATA.dygraphAllCharts = [];
	NETDATA.dygraphInitSync = function(callback) {
		//$.getScript(NETDATA.serverDefault + 'dygraph-synchronizer.js')
		//	.always(function() {
				if(typeof callback == "function")
					callback();
		//	})
	}

	NETDATA.dygraphSync = null;
	NETDATA.dygraphSyncAll = function() {
		if(NETDATA.dygraphSync) {
			NETDATA.dygraphSync.detach();
			NETDATA.dygraphSync = null;
		}

		NETDATA.dygraphSync = Dygraph.synchronize(NETDATA.dygraphAllCharts, {
 			selection: true,
 			zoom: false
 		});
	}

	NETDATA.dygraphInitialize = function(callback) {
		if(typeof netdataStopDygraph == 'undefined') {
			$.getScript(NETDATA.dygraph_js)
				.done(function() {
					NETDATA.registerChartLibrary('dygraph', NETDATA.dygraph_js);
				})
				.fail(function() {
					NETDATA.error(100, NETDATA.dygraph_js);
				})
				.always(function() {
					NETDATA.dygraphInitSync(callback);
				})
		}
		else {
			NETDATA.chartLibraries.dygraph.enabled = false;
			if(typeof callback == "function")
				callback();
		}
	};

	NETDATA.dygraphChartUpdate = function(element, data) {
		var self = $(element);
		var dygraph = self.data('dygraph-instance');

		if(typeof data.update_every != 'undefined')
			self.data('update-every', data.update_every * 1000);

		if(dygraph != null) {
			console.log('updating dygraphs');
			dygraph.updateOptions({
				file: data.data,
				labels: data.labels,
				labelsDivWidth: self.width() - 70
			});
		}
		else
			console.log('not updating dygraphs');
	};

	NETDATA.dygraphChartCreate = function(element, data) {
		var self = $(element);
		var chart = self.data('chart');
		var title = self.data('dygraph-title') || chart.title;
		var titleHeight = self.data('dygraph-titleHeight') || 20;
		var labelsDiv = self.data('dygraph-labelsDiv') || undefined;
		var connectSeparatedPoints = self.data('dygraph-connectSeparatedPoints') || false;
		var yLabelWidth = self.data('dygraph-yLabelWidth') || 12;
		var stackedGraph = self.data('dygraph-stackedGraph') || (chart.chart_type == 'stacked')?true:false;
		var stackedGraphNaNFill = self.data('dygraph-stackedGraphNaNFill') || 'none';
		var hideOverlayOnMouseOut = self.data('dygraph-hideOverlayOnMouseOut') || true;
		var fillGraph = self.data('dygraph-fillGraph') || (chart.chart_type == 'area')?true:false;
		var drawPoints = self.data('dygraph-drawPoints') || false;
		var labelsDivStyles = self.data('dygraph-labelsDivStyles') || { 'fontSize':'10px' };
		// var labelsDivWidth = self.data('dygraph-labelsDivWidth') || 250;
		var labelsDivWidth = self.width() - 70;
		var labelsSeparateLines = self.data('dygraph-labelsSeparateLines') || false;
		var labelsShowZeroValues = self.data('dygraph-labelsShowZeroValues') || true;
		var legend = self.data('dygraph-legend') || 'onmouseover';
		var showLabelsOnHighlight = self.data('dygraph-showLabelsOnHighlight') || true;
		var gridLineColor = self.data('dygraph-gridLineColor') || '#EEE';
		var axisLineColor = self.data('dygraph-axisLineColor') || '#EEE';
		var maxNumberWidth = self.data('dygraph-maxNumberWidth') || 8;
		var sigFigs = self.data('dygraph-sigFigs') || null;
		var digitsAfterDecimal = self.data('dygraph-digitsAfterDecimal') || 2;
		var axisLabelFontSize = self.data('dygraph-axisLabelFontSize') || 10;
		var axisLineWidth = self.data('dygraph-axisLineWidth') || 0.3;
		var drawAxis = self.data('dygraph-drawAxis') || true;
		var strokeWidth = self.data('dygraph-strokeWidth') || 1.0;
		var drawGapEdgePoints = self.data('dygraph-drawGapEdgePoints') || true;
		var colors = self.data('dygraph-colors') || NETDATA.colors;
		var pointSize = self.data('dygraph-pointSize') || 1;
		var stepPlot = self.data('dygraph-stepPlot') || false;
		var strokeBorderColor = self.data('dygraph-strokeBorderColor') || 'white';
		var strokeBorderWidth = self.data('dygraph-strokeBorderWidth') || (chart.chart_type == 'stacked')?1.0:0.0;
		var strokePattern = self.data('dygraph-strokePattern') || undefined;
		var highlightCircleSize = self.data('dygraph-highlightCircleSize') || 3;
		var highlightSeriesOpts = self.data('dygraph-highlightSeriesOpts') || { strokeWidth: 1.5 };
		var highlightSeriesBackgroundAlpha = self.data('dygraph-highlightSeriesBackgroundAlpha') || (chart.chart_type == 'stacked')?0.7:0.5;
		var pointClickCallback = self.data('dygraph-pointClickCallback') || undefined;
		var showRangeSelector = self.data('dygraph-showRangeSelector') || false;
		var showRoller = self.data('dygraph-showRoller') || false;
		var valueFormatter = self.data('dygraph-valueFormatter') || undefined; //function(x){ return x.toFixed(2); };
		var rightGap = self.data('dygraph-rightGap') || 5;
		var drawGrid = self.data('dygraph-drawGrid') || true;
		var drawXGrid = self.data('dygraph-drawXGrid') || undefined;
		var drawYGrid = self.data('dygraph-drawYGrid') || undefined;
		var gridLinePattern = self.data('dygraph-gridLinePattern') || null;
		var gridLineWidth = self.data('dygraph-gridLineWidth') || 0.3;

		var options = {
			title: title,
			titleHeight: titleHeight,
			ylabel: chart.units,
			yLabelWidth: yLabelWidth,
			connectSeparatedPoints: connectSeparatedPoints,
			drawPoints: drawPoints,
			fillGraph: fillGraph,
			stackedGraph: stackedGraph,
			stackedGraphNaNFill: stackedGraphNaNFill,
			drawGrid: drawGrid,
			drawXGrid: drawXGrid,
			drawYGrid: drawYGrid,
			gridLinePattern: gridLinePattern,
			gridLineWidth: gridLineWidth,
			gridLineColor: gridLineColor,
			axisLineColor: axisLineColor,
			axisLineWidth: axisLineWidth,
			drawAxis: drawAxis,
			hideOverlayOnMouseOut: hideOverlayOnMouseOut,
			labelsDiv: labelsDiv,
			labelsDivStyles: labelsDivStyles,
			labelsDivWidth: labelsDivWidth,
			labelsSeparateLines: labelsSeparateLines,
			labelsShowZeroValues: labelsShowZeroValues,
			labelsKMB: false,
			labelsKMG2: false,
			legend: legend,
			showLabelsOnHighlight: showLabelsOnHighlight,
			maxNumberWidth: maxNumberWidth,
			sigFigs: sigFigs,
			digitsAfterDecimal: digitsAfterDecimal,
			axisLabelFontSize: axisLabelFontSize,
			colors: colors,
			strokeWidth: strokeWidth,
			drawGapEdgePoints: drawGapEdgePoints,
			pointSize: pointSize,
			stepPlot: stepPlot,
			strokeBorderColor: strokeBorderColor,
			strokeBorderWidth: strokeBorderWidth,
			strokePattern: strokePattern,
			highlightCircleSize: highlightCircleSize,
			highlightSeriesOpts: highlightSeriesOpts,
			highlightSeriesBackgroundAlpha: highlightSeriesBackgroundAlpha,
			pointClickCallback: pointClickCallback,
			showRangeSelector: showRangeSelector,
			showRoller: showRoller,
			valueFormatter: valueFormatter,
			rightGap: rightGap,
			labels: data.labels,
			axes: {
				x: {
					pixelsPerLabel: 50,
					ticker: Dygraph.dateTicker,
					axisLabelFormatter: function (d, gran) {
						return Dygraph.zeropad(d.getHours()) + ":" + Dygraph.zeropad(d.getMinutes()) + ":" + Dygraph.zeropad(d.getSeconds());
					},
					valueFormatter :function (ms) {
						var d = new Date(ms);
						return Dygraph.zeropad(d.getHours()) + ":" + Dygraph.zeropad(d.getMinutes()) + ":" + Dygraph.zeropad(d.getSeconds());
					}
				},
				y: {
					pixelsPerLabel: 15
				}
			}
		};

		var uuid = NETDATA.guid();
		self.html('<div id="' + uuid + '" style="width: 100%; height: 100%;"></div>');

		var dchart = new Dygraph(document.getElementById(uuid),
			data.data, options);

		self.data('dygraph-instance', dchart)
			.data('dygraph-options', options)
			.data('uuid', uuid)
			.data('created', true);

		//NETDATA.dygraphAllCharts.push(dchart);
		//if(NETDATA.dygraphAllCharts.length > 1)
		//	NETDATA.dygraphSyncAll();
	};

	// ----------------------------------------------------------------------------------------------------------------
	// morris

	NETDATA.morrisInitialize = function(callback) {
		if(typeof netdataStopMorris == 'undefined') {

			// morris requires raphael
			if(!NETDATA.chartLibraries.raphael.initialized) {
				if(NETDATA.chartLibraries.raphael.enabled) {
					NETDATA.raphaelInitialize(function() {
						NETDATA.morrisInitialize(callback);
					});
				}
				else {
					NETDATA.chartLibraries.morris.enabled = false;
					if(typeof callback == "function")
						callback();
				}
			}

			var fileref = document.createElement("link");
			fileref.setAttribute("rel", "stylesheet");
			fileref.setAttribute("type", "text/css");
			fileref.setAttribute("href", NETDATA.morris_css);

			if (typeof fileref != "undefined")
				document.getElementsByTagName("head")[0].appendChild(fileref);

			$.getScript(NETDATA.morris_js)
				.done(function() {
					NETDATA.registerChartLibrary('morris', NETDATA.morris_js);
				})
				.fail(function() {
					NETDATA.error(100, NETDATA.morris_js);
				})
				.always(function() {
					if(typeof callback == "function")
						callback();
				})
		}
		else {
			NETDATA.chartLibraries.morris.enabled = false;
			if(typeof callback == "function")
				callback();
		}
	};

	NETDATA.morrisChartUpdate = function(element, data) {
		var self = $(element);
		var morris = self.data('morris-instance');

		if(typeof data.update_every != 'undefined')
			self.data('update-every', data.update_every * 1000);

		if(morris != null) {
			console.log('updating morris');
			morris.setData(data.data);
		}
		else
			console.log('not updating morris');
	};

	NETDATA.morrisChartCreate = function(element, data) {
		var self = $(element);
		var chart = self.data('chart');

		var uuid = NETDATA.guid();
		self.html('<div id="' + uuid + '" style="width: ' + self.data('calculated-width') + 'px; height: ' + self.data('calculated-height') + 'px;"></div>');

		// remove the 'time' element from the labels
		data.labels.splice(0, 1);

		var options = {
				element: uuid,
				data: data.data,
				xkey: 'time',
				ykeys: data.labels,
				labels: data.labels,
				lineWidth: 2,
				pointSize: 2,
				smooth: true,
				hideHover: 'auto',
				parseTime: true,
				continuousLine: false,
				behaveLikeLine: false
		};

		var morris;
		if(chart.chart_type == 'line')
			morris = new Morris.Line(options);

		else if(chart.chart_type == 'area') {
			options.behaveLikeLine = true;
			morris = new Morris.Area(options);
		}
		else // stacked
			morris = new Morris.Area(options);

		self.data('morris-instance', morris)
		.data('created', true);
	};

	// ----------------------------------------------------------------------------------------------------------------
	// raphael

	NETDATA.raphaelInitialize = function(callback) {
		if(typeof netdataStopRaphael == 'undefined') {
			$.getScript(NETDATA.raphael_js)
				.done(function() {
					NETDATA.registerChartLibrary('raphael', NETDATA.raphael_js);
				})
				.fail(function() {
					NETDATA.error(100, NETDATA.raphael_js);
				})
				.always(function() {
					if(typeof callback == "function")
						callback();
				})
		}
		else {
			NETDATA.chartLibraries.raphael.enabled = false;
			if(typeof callback == "function")
				callback();
		}
	};

	NETDATA.raphaelChartUpdate = function(element, data) {
		var self = $(element);

		self.raphael(data, {
			width: self.data('calculated-width'),
			height: self.data('calculated-height')
		})
	};

	NETDATA.raphaelChartCreate = function(element, data) {
		var self = $(element);

		self.raphael(data, {
			width: self.data('calculated-width'),
			height: self.data('calculated-height')
		})
		.data('created', true);
	};

	// ----------------------------------------------------------------------------------------------------------------
	// google charts

	NETDATA.googleInitialize = function(callback) {
		if(typeof netdataStopGoogleCharts == 'undefined') {
			$.getScript(NETDATA.google_js)
				.done(function() {
					NETDATA.registerChartLibrary('google', NETDATA.google_js);

					google.load('visualization', '1.1', {
						'packages': ['corechart', 'controls'],
						'callback': callback
					});
				})
				.fail(function() {
					NETDATA.error(100, NETDATA.google_js);
					if(typeof callback == "function")
						callback();
				})
		}
		else {
			NETDATA.chartLibraries.google.enabled = false;
			if(typeof callback == "function")
				callback();
		}
	};

	NETDATA.googleChartUpdate = function(element, data) {
		var self = $(element);
		var gchart = self.data('google-instance');
		var options = self.data('google-options');

		if(typeof data.update_every != 'undefined')
			self.data('update-every', data.update_every * 1000);

		var datatable = new google.visualization.DataTable(data);

		gchart.draw(datatable, options);
	};

	NETDATA.googleChartCreate = function(element, data) {
		var self = $(element);
		var chart = self.data('chart');

		var datatable = new google.visualization.DataTable(data);
		var gchart;

		var options = {
			// do not set width, height - the chart resizes itself
			//width: self.data('calculated-width'),
			//height: self.data('calculated-height'),
			lineWidth: 1,
			title: chart.title,
			fontSize: 11,
			hAxis: {
			//	title: "Time of Day",
			//	format:'HH:mm:ss',
				viewWindowMode: 'maximized',
				slantedText: false,
				format:'HH:mm:ss',
				textStyle: {
					fontSize: 9
				},
				gridlines: {
					color: '#EEE'
				}
			},
			vAxis: {
				title: chart.units,
				viewWindowMode: 'pretty',
				minValue: -0.1,
				maxValue: 0.1,
				direction: 1,
				textStyle: {
					fontSize: 9
				},
				gridlines: {
					color: '#EEE'
				}
			},
			chartArea: {
				width: '65%',
				height: '80%'
			},
			focusTarget: 'category',
			annotation: {
				'1': {
					style: 'line'
				}
			},
			pointsVisible: 0,
			titlePosition: 'out',
			titleTextStyle: {
				fontSize: 11
			},
			tooltip: {
				isHtml: false,
				ignoreBounds: true,
				textStyle: {
					fontSize: 9
				}
			},
			curveType: 'function',
			areaOpacity: 0.3,
			isStacked: false
		};

		var uuid = NETDATA.guid();
		self.html('<div id="' + uuid + '" style="width: 100%; height: 100%;"></div>');

		switch(chart.chart_type) {
			case "area":
				options.vAxis.viewWindowMode = 'maximized';
				gchart = new google.visualization.AreaChart(document.getElementById(uuid));
				break;

			case "stacked":
				options.isStacked = true;
				options.areaOpacity = 0.85;
				options.vAxis.viewWindowMode = 'maximized';
				options.vAxis.minValue = null;
				options.vAxis.maxValue = null;
				gchart = new google.visualization.AreaChart(document.getElementById(uuid));
				break;

			default:
			case "line":
				options.lineWidth = 2;
				gchart = new google.visualization.LineChart(document.getElementById(uuid));
				break;
		}

		gchart.draw(datatable, options);

		self.data('google-instance', gchart)
			.data('google-options', options)
			.data('uuid', uuid)
			.data('created', true);
	};

	// ----------------------------------------------------------------------------------------------------------------
	// Charts Libraries Registration

	NETDATA.chartLibraries = {
		"dygraph": {
			initialize: NETDATA.dygraphInitialize,
			create: NETDATA.dygraphChartCreate,
			update: NETDATA.dygraphChartUpdate,
			initialized: false,
			enabled: true,
			format: 'json',
			options: 'ms|flip',
			pixels_per_point: 2,
			detects_dimensions_on_update: false
		},
		"sparkline": {
			initialize: NETDATA.sparklineInitialize,
			create: NETDATA.sparklineChartCreate,
			update: NETDATA.sparklineChartUpdate,
			initialized: false,
			enabled: true,
			format: 'array',
			options: 'flip|min2max',
			pixels_per_point: 2,
			detects_dimensions_on_update: false
		},
		"peity": {
			initialize: NETDATA.peityInitialize,
			create: NETDATA.peityChartCreate,
			update: NETDATA.peityChartUpdate,
			initialized: false,
			enabled: true,
			format: 'ssvcomma',
			options: 'null2zero|flip|min2max',
			pixels_per_point: 2,
			detects_dimensions_on_update: false
		},
		"morris": {
			initialize: NETDATA.morrisInitialize,
			create: NETDATA.morrisChartCreate,
			update: NETDATA.morrisChartUpdate,
			initialized: false,
			enabled: true,
			format: 'json',
			options: 'objectrows|ms',
			pixels_per_point: 10,
			detects_dimensions_on_update: false
		},
		"google": {
			initialize: NETDATA.googleInitialize,
			create: NETDATA.googleChartCreate,
			update: NETDATA.googleChartUpdate,
			initialized: false,
			enabled: true,
			format: 'datatable',
			options: '',
			pixels_per_point: 2,
			detects_dimensions_on_update: true
		},
		"raphael": {
			initialize: NETDATA.raphaelInitialize,
			create: NETDATA.raphaelChartCreate,
			update: NETDATA.raphaelChartUpdate,
			initialized: false,
			enabled: true,
			format: 'json',
			options: '',
			pixels_per_point: 1,
			detects_dimensions_on_update: false
		}
	};

	NETDATA.registerChartLibrary = function(library, url) {
		console.log("registering chart library: " + library);

		NETDATA.chartLibraries[library].url = url;
		NETDATA.chartLibraries[library].initialized = true;
		NETDATA.chartLibraries[library].enabled = true;

		console.log(NETDATA.chartLibraries);
	}

	// ----------------------------------------------------------------------------------------------------------------
	// load all libraries and initialize

	NETDATA.errorReset();

	NETDATA._loadjQuery(function() {
		$.getScript(NETDATA.serverDefault + 'lib/visible.js').then(function() {
			NETDATA.init();
		})
	});

})(window);