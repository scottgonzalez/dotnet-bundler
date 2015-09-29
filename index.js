var Crypto = require("crypto");
var Fs = require("fs");
var Path = require("path");
var CleanCss = require("clean-css");
var Concat = require("concat-with-sourcemaps");
var Mkdirp = require("mkdirp");
var Sass = require("node-sass");
var Uglify = require("uglify-js");
var Promise = require("es6-promise").Promise;

var Bundler = module.exports;
Bundler.bundle = bundle;
Bundler.bundleScripts = bundleScripts;
Bundler.bundleStyles = bundleStyles;
Bundler.cssCompilers = {};

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

function bundleAllResources(config, resourceType, resourceExtension) {
	var resourceTypePlural = resourceType + "s";
	var promises = Object.keys(config[resourceTypePlural]).map(function(bundleName) {
		var bundlePath = config.Paths[resourceType + "Bundles"] + bundleName + resourceExtension;
		var fullBundlePath = config.webroot + bundlePath;

		Mkdirp(Path.dirname(fullBundlePath));

		return Promise.resolve(Bundler["bundle" + resourceTypePlural]({
			webroot: config.webroot,
			bundle: bundlePath,
			sources: config[resourceTypePlural][bundleName]
		}))
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

			Fs.writeFileSync(
				config.webroot + config.Paths[resourceType + "Bundles"] + "bundles.json",
				JSON.stringify(checksums, null, "\t")
			);
		})
		.then(function() {
			return config;
		});
}

function bundleAllScripts(config) {
	return bundleAllResources(config, "Script", ".js");
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
	return bundleAllResources(config, "Style", ".css");
}

function bundleStyles(paths) {
	var promises = paths.sources.map(function(stylesheet) {
		var extension = Path.extname(paths.webroot + stylesheet);

		var compiler = Bundler.cssCompilers[extension];
		if (!compiler) {
			throw new Error("Unknown extension for stylesheet: " + extension);
		}

		return Promise.resolve(compiler(paths.webroot, stylesheet))
			.then(function(compiled) {
				var source = [stylesheet];

				if (typeof compiled === "string" || Buffer.isBuffer(compiled)) {
					source.push(compiled);
				} else {
					source.push(compiled.code);
					if (compiled.map) {
						source.push(compiled.map);
					}
				}

				return source;
			});
	});

	return Promise.all(promises)
		.then(function(concatSources) {
			var concatBundle = new Concat(true, paths.bundle, "\n");
			concatSources.forEach(function(source) {
				concatBundle.add.apply(concatBundle, source);
			});

			return {
				code: concatBundle.content,
				map: concatBundle.sourceMap
			};
		})
		.then(function(concatBundle) {
			return new Promise(function(resolve, reject) {
				new CleanCss({
					sourceMap: concatBundle.map,
				})
					.minify(concatBundle.code, function(error, minified) {
						if (error) {
							return reject(error);
						}

						resolve({
							code: minified.styles,
							map: minified.sourceMap.toString()
						});
					});
			});
		})
		.then(function(minified) {
			var sourceMapPath = paths.bundle + ".map";
			var content = minified.code + "/*# sourceMappingURL=" + sourceMapPath + " */";

			Fs.writeFileSync(paths.webroot + paths.bundle, content);
			Fs.writeFileSync(paths.webroot + sourceMapPath, minified.map);
		});
}

Bundler.cssCompilers[".css"] = function(webroot, sourcePath) {
	return Fs.readFileSync(webroot + sourcePath);
};

Bundler.cssCompilers[".sass"] =
Bundler.cssCompilers[".scss"] = function(webroot, sourcePath) {
	var result = Sass.renderSync({
		file: webroot + sourcePath,
		sourceMap: true,
		omitSourceMapUrl: true,
		outFile: sourcePath.replace(/s[ca]ss$/, "css")
	});

	return {
		code: result.css,
		map: result.map
	};
};

function bundle(config) {
	return parseConfig(config)
		.then(bundleAllScripts)
		.then(bundleAllStyles);
}
