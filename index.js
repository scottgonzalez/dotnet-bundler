var Crypto = require("crypto");
var Fs = require("fs");
var Path = require("path");
var Concat = require("concat-with-sourcemaps");
var Mkdirp = require("mkdirp");
var Uglify = require("uglify-js");
var Promise = require("es6-promise").Promise;

var Bundler = module.exports;
Bundler.bundle = bundle;
Bundler.bundleScripts = bundleScripts;
Bundler.bundleStyles = bundleStyles;

var defaultPaths = {
	ScriptSource: "/js/src/",
	ScriptBundles: "/js/bundle/",
	StyleSource: "/css/src/",
	StyleBundles: "/css/bundle/"
};

function parseConfig(config) {
	if (!config.Paths) {
		config.Paths = {};
	}

	Object.keys(defaultPaths).forEach(function (key) {
		if (!config.Paths[key]) {
			config.Paths[key] = defaultPaths[key];
		}

		if (!/^\//.test(config.Paths[key])) {
			config.Paths[key] = "/" + config.Paths[key];
		}
		if (!/\/$/.test(config.Paths[key])) {
			config.Paths[key] += "/";
		}
	});

	return Promise.resolve(expandPaths(config));
}

function expandPaths(config) {
	if (!config.Scripts) {
		config.Scripts = {};
	}

	Object.keys(config.Scripts).forEach(function (bundleName) {
		config.Scripts[bundleName] = config.Scripts[bundleName].map(function (script) {
			return config.Paths.ScriptSource + script;
		});
	});

	if (!config.Styles) {
		config.Styles = {};
	}

	Object.keys(config.Styles).forEach(function (bundleName) {
		config.Styles[bundleName] = config.Styles[bundleName].map(function (style) {
			return config.Paths.StyleSource + style;
		});
	});

	return config;
}

function createChecksum(path) {
	var content = Fs.readFileSync(path);
	var checksum = Crypto.createHash("md5");
	checksum.update(content);
	return checksum.digest("hex");
}

function bundleAllScripts(config) {
	var promises = Object.keys(config.Scripts).map(function(bundleName) {
		var bundlePath = config.Paths.ScriptBundles + bundleName + ".js";
		var fullBundlePath = config.webroot + bundlePath;

		Mkdirp(Path.dirname(fullBundlePath));

		return Promise.resolve()
			.then(function() {
				return Bundler.bundleScripts({
					webroot: config.webroot,
					bundle: bundlePath,
					sources: config.Scripts[bundleName]
				});
			})
			.then(function() {
				return {
					bundleName: bundleName,
					checksum: createChecksum(fullBundlePath)
				};
			});
	});

	return Promise.all(promises)
		.then(function(bundles) {
			var checksums = {};
			bundles.forEach(function(bundle) {
				checksums[bundle.bundleName] = bundle.checksum;
			});

			Fs.writeFileSync(config.webroot + config.Paths.ScriptBundles + "bundles.json",
				JSON.stringify(checksums, null, "\t"));
		});
}

function bundleScripts(paths) {
	var concatBundle = new Concat(true, paths.bundle, "\n");
	paths.sources.forEach(function(script) {
		concatBundle.add(script, Fs.readFileSync(paths.webroot + script));
	});

	var sourceMapPath = paths.bundle + ".map";
	var minBundle = Uglify.minify(
		concatBundle.content + "//# sourceMappingURL=" + sourceMapPath,
		{
			fromString: true,
			inSourceMap: JSON.parse(concatBundle.sourceMap),
			outSourceMap: sourceMapPath,
			sourceRoot: paths.webroot
		}
	);

	Fs.writeFileSync(paths.webroot + paths.bundle, minBundle.code);
	Fs.writeFileSync(paths.webroot + sourceMapPath, minBundle.map);
}

function bundleAllStyles(config) {

}

function bundleStyles(paths) {

}

function bundle(config) {
	return parseConfig(config)
		.then(bundleAllScripts)
		.then(bundleAllStyles);
}
