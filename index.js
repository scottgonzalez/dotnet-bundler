var Crypto = require("crypto");
var Fs = require("fs");
var Path = require("path");
var Concat = require("concat-with-sourcemaps");
var Mkdirp = require("mkdirp");
var Uglify = require("uglify-js");

module.exports = bundle;

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

	return expandPaths(config);
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

function bundleScripts(config) {
	var checksums = {};

	Object.keys(config.Scripts).forEach(function (bundleName) {
		var concatPath = config.Paths.ScriptBundles + bundleName + ".concat.js";
		var fullConcatPath = config.webroot + concatPath;
		var concatSourceMapPath = concatPath.replace(/js$/, "map");
		var fullConcatSourceMapPath = config.webroot + concatSourceMapPath;

		var minPath = concatPath.replace(/.concat.js$/, ".js");
		var fullMinPath = config.webroot + minPath;
		var minSourceMapPath = minPath.replace(/js$/, "map");
		var fullMinSourceMapPath = config.webroot + minSourceMapPath;

		var concatBundle = new Concat(true, concatPath, "\n");
		config.Scripts[bundleName].forEach(function(script) {
			concatBundle.add(script, Fs.readFileSync(config.webroot + script));
		});

		Mkdirp(Path.dirname(fullConcatPath));
		Fs.writeFileSync(fullConcatPath,
			concatBundle.content + "//# sourceMappingURL=" + concatSourceMapPath);
		Fs.writeFileSync(fullConcatSourceMapPath, concatBundle.sourceMap);

		var minBundle = Uglify.minify(fullConcatPath, {
			inSourceMap: fullConcatSourceMapPath,
			outSourceMap: minSourceMapPath,
			sourceRoot: config.webroot
		});

		Fs.writeFileSync(fullMinPath, minBundle.code);
		Fs.writeFileSync(fullMinSourceMapPath, minBundle.map);

		var checksum = Crypto.createHash("md5");
		checksum.update(minBundle.code);
		checksums[bundleName] = checksum.digest("hex");
	});

	Fs.writeFileSync(config.webroot + config.Paths.ScriptBundles + "bundles.json",
		JSON.stringify(checksums, null, "\t"));
}

function bundleStyles(config) {

}

function bundle(config) {
	config = parseConfig(config);

	bundleScripts(config);
	bundleStyles(config);
}
