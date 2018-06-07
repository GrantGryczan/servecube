const fs = require("fs-extra");
const http = require("http");
const https = require("https");
const request = require("request-promise-native");
const express = require("express");
const bodyParser = require("body-parser");
const pathToRegexp = require("path-to-regexp");
const childProcess = require("child_process");
const crypto = require("crypto");
const babel = require("babel-core");
const UglifyJS = require("uglify-js");
const sass = require("node-sass");
const CleanCSS = require("clean-css");
const mime = require("mime");
const pathToRegexpOptions = {
	sensitive: true,
	strict: true
};
const cleaner = new CleanCSS({
	inline: false,
	sourceMap: true
});
mime.define({
	"text/html": ["njs"]
});
class ServeCubeError extends Error {
	constructor() {
		const err = super(...arguments);
		err.name = "ServeCubeError";
		return err;
	}
}
const AsyncFunction = (async () => {}).constructor;
const backslashes = /\\/g;
const brs = /\n/g;
const whitespace = /\s+/g;
const escapeRegExpTest = /([\\()[|{^$.+*?])/g;
const escapeRegExp = str => str.replace(escapeRegExpTest, "\\$1");
const pageExtExp = "\.(?:.*\.)?(?:[Nn][Jj][Ss]|[Hh][Tt][Mm][Ll]?)$";
const njsExtTest = /\.njs$/i;
const htmlExtTest = /\.html?$/i;
const pageExtTest = /\.(?:njs|html?)$/i;
const indexTest = /^index\.(?:.*\.)?(?:njs|html?)$/i;
const allMethods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
const allMethodsString = allMethods.join(", ");
const allMethodsExp = `(${allMethods.join("|")})`;
const methodTest = new RegExp(`^${allMethodsExp}(?:, ?${allMethodsExp})?(?:, ?${allMethodsExp})?(?:, ?${allMethodsExp})?(?:, ?${allMethodsExp})?${pageExtExp}`);
const methodAllTest = new RegExp(`^ALL${pageExtExp}`);
const templateTest = /\{(\w+)}/g;
const htmlTest = /(html`(?:(?:\${(?:`(?:.*?|\n)`|"(?:.*?|\n)"|'(?:.*?|\n)'|.|\n)*?})|.|\n)*?`)/g;
const subdomainTest = /^(?:\*|[0-9a-z.]*)$/i;
const subdomainValueTest = /^.*[.\/]$/;
const htmlExps = ["$", "&"];
const htmlReplacements = [[/&/g, "&amp;"], [/</g, "&lt;"], [/>/g, "&gt;"], [/"/g, "&quot;"], [/'/g, "&#39;"], [/`/g, "&#96;"]];
const urlReplacements = [[/\/\.{1,2}\//g, "/"], [/[\\\/]+/g, "/"], [pageExtTest, ""], [/\/index$/i, "/"]];
const byFirstItems = v => v[0];
const byNames = v => v.name;
const byNoLastItems = v => v.slice(0, -1);
const byUniqueDirectories = (v, i, t) => v.endsWith("/") && t.indexOf(v) === i;
const minifyHTML = code => code.replace(brs, "").replace(whitespace, " ");
const minifyHTMLInJS = code => {
	code = code.split(htmlTest);
	for(let j = 1; j < code.length; j += 2) {
		code[j] = minifyHTML(code[j]);
	}
	return code.join("");
};
const ServeCube = module.exports = {
	html: function() {
		let string = arguments[0][0];
		const exps = arguments.length-1;
		for(let i = 0; i < exps; i++) {
			let code = String(arguments[i+1]);
			const expIndex = htmlExps.indexOf(arguments[0][i].slice(-1));
			if(expIndex !== -1) {
				string = string.slice(0, -1);
				for(let j = expIndex; j < htmlReplacements.length; j++) {
					code = code.replace(...htmlReplacements[j]);
				}
			}
			string += code + arguments[0][i+1];
		}
		return string;
	},
	serve: async options => {
		const cube = {};
		if(!(options instanceof Object)) {
			throw new ServeCubeError("The `options` parameter must be an object.");
		}
		if(typeof options.domain !== "string") {
			throw new ServeCubeError("The `domain` option must be a string.");
		}
		options = {...options};
		if(!(options.eval instanceof Function)) {
			options.eval = eval;
		}
		if(typeof options.basePath !== "string") {
			options.basePath = `${process.cwd()}/`;
		} else if(!options.basePath.endsWith("/")) {
			options.basePath = `${options.basePath}/`;
		}
		options.basePath = options.basePath.replace(backslashes, "/");
		if(typeof options.errorDir === "string") {
			if(options.errorDir.startsWith("/")) {
				options.errorDir = options.errorDir.slice(1);
			} else if(options.errorDir.endsWith("/")) {
				options.errorDir = options.errorDir.slice(0, -1);
			}
		} else {
			options.errorDir = undefined;
		}
		if(typeof options.httpPort !== "number") {
			options.httpPort = 8080;
		}
		if(options.tls instanceof Object) {
			if(typeof options.httpsPort !== "number") {
				options.httpsPort = 8443;
			}
		} else {
			delete options.tls;
		}
		options.httpsRedirect = options.httpsRedirect === false ? false : !!(options.httpsRedirect || options.tls);
		if(options.subdomains instanceof Object) {
			for(const i of Object.keys(options.subdomains)) {
				if(subdomainTest.test(i)) {
					if(typeof options.subdomains[i] !== "string") {
						throw new ServeCubeError(`The subdomain value associated with \`${i}\` is not a string.`);
					} else if(!subdomainValueTest.test(options.subdomains[i])) {
						throw new ServeCubeError(`"${options.subdomains[i]}" is not a valid subdomain value.`);
					}
				} else {
					throw new ServeCubeError(`"${i}" is not a valid subdomain.`);
				}
			}
		} else {
			options.subdomains = {};
		}
		if(options.subdomains["*"] === undefined) {
			if(options.subdomains[""] === undefined) {
				options.subdomains[""] = "www/";
			}
			options.subdomains["*"] = ".";
		}
		if(typeof options.githubSecret === "string") {
			if(options.githubSubdomain === undefined) {
				options.githubSubdomain = "";
			}
		} else {
			options.githubSecret = false;
		}
		if(!(options.loadStart instanceof Array)) {
			delete options.loadStart;
		}
		if(!(options.loadEnd instanceof Array)) {
			delete options.loadEnd;
		}
		const requestOptions = {
			headers: {
				"User-Agent": "ServeCube"
			}
		};
		if(typeof options.githubToken === "string") {
			requestOptions.headers.Authorization = `token ${options.githubToken}`;
		}
		const originTest = new RegExp(`^https?://(?:.+\\.)?${escapeRegExp(options.domain)}$`);
		const app = cube.app = express();
		app.set("trust proxy", true);
		if(!options.domain.includes(".")) {
			app.set("subdomain offset", 1);
		}
		const tree = cube.tree = {};
		const getPaths = (path, paramName) => {
			if(typeof path !== "string") {
				throw new ServeCubeError(`The \`${paramName || "path"}\` parameter must be a string.`);
			}
			const output = {};
			if(!(output.dir = (output.paths = path.split("/")).shift())) {
				throw new ServeCubeError("The specified path contains no base directory.");
			}
			if(!tree[output.dir]) {
				throw new ServeCubeError(`The specified base directory, \`${output.dir}\`, is not planted.`);
			}
			return output;
		};
		const getRawPath = cube.getRawPath = async (path, method) => {
			method = typeof method === "string" ? method.toUpperCase() : "GET";
			const {dir, paths} = getPaths(path);
			const output = {
				rawPath: dir
			};
			let parent = tree[dir];
			while(paths.length) {
				let child;
				if(paths[0] === "") {
					if(parent.index) {
						child = parent.index;
					} else {
						output.rawPath = undefined;
						break;
					}
				} if(parent.children[paths[0]] && !parent.children[paths[0]].test) {
					child = paths[0];
				} else {
					for(const i of Object.keys(parent.children)) {
						if(parent.children[i].test) {
							let matches = paths[0].match(parent.children[i].test);
							if(matches) {
								child = i;
								if(!output.params) {
									output.params = {};
								}
								for(let j = 0; j < parent.children[i].params.length; j++) {
									output.params[parent.children[i].params[j]] = matches[j+1];
								}
								break;
							}
						} else if(pageExtTest.test(i) && paths[0] === i.replace(pageExtTest, "")) {
							child = i;
							break;
						}
					}
				}
				if(child) {
					if(paths.length === 1) {
						if(parent.children[child].methods) {
							output.methods = Object.keys(parent.children[child].methods);
							if(parent.children[child].methods[method]) {
								output.rawPath += `/${child}`;
								child = (parent = parent.children[child]).methods[method];
							} else {
								output.methodNotAllowed = true;
								output.rawPath = undefined;
								break;
							}
						}
						output.rawPath += `/${child}`;
						output.hasIndex = !!parent.children[child].index;
						output.func = parent.children[child].func;
						break;
					} else if(!parent.children[child].children) {
						output.rawPath += `/${child}`;
						break;
					}
					output.rawPath += `/${child}`;
					parent = parent.children[child];
					paths.shift();
				} else {
					output.rawPath = undefined;
					break;
				}
			}
			if(paths.length !== 1) {
				output.rawPath = undefined;
			}
			if(output.rawPath) {
				const fullPath = options.basePath + output.rawPath;
				if(!await fs.exists(fullPath)) {
					throw new ServeCubeError(`The file \`${fullPath}\` is planted but was not found.`);
				} else if((await fs.stat(fullPath)).isDirectory()) {
					output.rawPath = undefined;
				}
			}
			return output;
		};
		const plantChild = async (parent, child, isDir, fullPath) => {
			parent.children[child] = {};
			if(!isDir && pageExtTest.test(child)) {
				if(indexTest.test(child)) {
					parent.index = child;
				} else if(methodAllTest.test(child)) {
					if(!parent.methods) {
						parent.methods = {};
					}
					for(const v of allMethods) {
						if(!parent.methods[v]) {
							parent.methods[v] = child;
						}
					}
				} else {
					const methods = child.match(methodTest);
					if(methods) {
						if(!parent.methods) {
							parent.methods = {};
						}
						for(let i = 1; i < methods.length; i++) {
							if(methods[i]) {
								parent.methods[methods[i]] = child;
							}
						}
					}
				}
			}
			const params = [];
			const re = pathToRegexp(child.replace(pageExtTest, "").replace(templateTest, ":$1"), params, pathToRegexpOptions);
			if(params.length) {
				parent.children[child].params = params.map(byNames);
				parent.children[child].test = re;
			}
			if(isDir) {
				parent.children[child].children = {};
			} else if(njsExtTest.test(child)) {
				try {
					parent.children[child].func = options.eval(`(async function() {\n${await fs.readFile(fullPath)}\n})`);
				} catch(err) {
					throw new ServeCubeError(`An error occured while evaluating \`${fullPath}\`.\n${err.stack}`);
				}
				if(!(parent.children[child].func instanceof AsyncFunction)) {
					throw new ServeCubeError("The `eval` option must return the evaluated input, which should always be an async function.");
				}
			}
		}
		const plant = async (parent, path) => {
			const children = await fs.readdir(options.basePath + path);
			for(const v of children) {
				const childPath = `${path}/${v}`;
				const fullPath = options.basePath + childPath;
				const isDir = (await fs.stat(fullPath)).isDirectory();
				await plantChild(parent, v, isDir, fullPath);
				if(isDir) {
					await plant(parent.children[v], childPath);
				}
			}
		};
		const limb = cube.limb = rawPath => {
			const {dir, paths} = getPaths(rawPath, "rawPath");
			let parent = tree[dir];
			const parents = [[dir, parent]];
			while(paths.length) {
				const child = paths.shift();
				if(parent.children && parent.children[child]) {
					parents.unshift([child, parent = parent.children[child]]);
				} else {
					throw new ServeCubeError(`The file \`${parents.map(byFirstItems).join("/")}/${child}\` is not planted.`);
				}
			}
			if(parents[0][1].children) {
				const dirPath = `${rawPath}/`;
				for(const i of Object.keys(loadCache)) {
					if(i.startsWith(dirPath)) {
						delete loadCache[i];
					}
				}
			}
			delete loadCache[rawPath];
			while(parents.length) {
				const child = parents.shift()[0];
				if(parents[0][1].index === child) {
					delete parents[0][1].index;
				}
				if(parents[0][1].methods) {
					for(const i of Object.keys(parents[0][1].methods)) {
						if(parents[0][1].methods[i] === child) {
							delete parents[0][1].methods[i];
						}
					}
					if(!Object.keys(parents[0][1].methods).length) {
						delete parents[0][1].methods;
					}
				}
				delete parents[0][1].children[child];
				if(Object.keys(parents[0][1].children).length) {
					break;
				}
			}
		};
		const replant = cube.replant = async rawPath => {
			const {dir, paths} = getPaths(rawPath, "rawPath");
			let parent = tree[dir];
			while(paths.length) {
				if(parent) {
					if(parent.children) {
						if(parent.children[paths[0]]) {
							parent = parent.children[paths[0]];
							paths.shift();
						} else {
							break;
						}
					} else {
						throw new ServeCubeError(`The file \`${rawPath.split("/").slice(0, -paths.length).join("/")}\` has no children as it is not a directory.`);
					}
				} else {
					break;
				}
			}
			if(!paths.length) {
				limb(rawPath);
				return replant(rawPath);
			}
			const fullPath = options.basePath + rawPath;
			if(!await fs.exists(fullPath)) {
				throw new ServeCubeError(`The file \`${fullPath}\` was not found.`);
			} else if((await fs.stat(fullPath)).isDirectory()) {
				throw new ServeCubeError(`The file \`${fullPath}\` is a directory.`);
			}
			while(paths.length-1) {
				const child = paths.shift();
				await plantChild(parent, child, true);
				parent = parent.children[child];
			}
			await plantChild(parent, paths[0], false, fullPath);
		};
		let dirs = [...Object.values(options.subdomains)];
		if(options.errorDir) {
			dirs.push(`${options.errorDir}/`);
		}
		for(const v of dirs = dirs.filter(byUniqueDirectories).map(byNoLastItems)) {
			await plant(tree[v] = {
				children: {}
			}, v);
		}
		const loadCache = cube.loadCache = {};
		const load = cube.load = async (path, context) => {
			if(context && !(context instanceof Object)) {
				throw new ServeCubeError("The `context` parameter must be an object.");
			}
			const {rawPath, params, func} = await getRawPath(path, context.method);
			if(!rawPath) {
				throw new ServeCubeError(`The file \`${path}\` is not planted.`);
			}
			const fullPath = options.basePath + rawPath;
			if(func) {
				if(context) {
					context = {
						...context
					};
					// Delete properties which may not be passed into loaded context.
					delete context.done;
					delete context.value;
					delete context.status;
					delete context.redirect;
					delete context.cache;
				} else {
					context = {};
				}
				Object.assign(context, {
					rawPath,
					params
				});
				context.value = "";
				let cacheIndex;
				return loadCache[context.rawPath] && loadCache[context.rawPath][cacheIndex = `#${loadCache[context.rawPath].vary(context)}`] ? {
					...context,
					...loadCache[context.rawPath][cacheIndex]
				} : await new Promise(async (resolve, reject) => {
					let resolution;
					if(options.loadStart) {
						for(const v of options.loadStart) {
							if(v instanceof Function) {
								resolution = v(context);
								if(resolution instanceof Promise) {
									resolution = await resolution;
								}
								if(resolution === false) {
									break;
								}
							}
						}
					}
					context.done = async () => {
						if(options.loadEnd) {
							for(const v of options.loadEnd) {
								if(v instanceof AsyncFunction) {
									await v(context);
								} else if(v instanceof Function) {
									v(context);
								}
							}
						}
						const returnedContext = {
							...context
						};
						// Delete properties which are not included in resolved context.
						delete returnedContext.rawPath;
						delete returnedContext.done;
						delete returnedContext.req;
						delete returnedContext.res;
						delete returnedContext.method;
						delete returnedContext.params;
						if(context.cache) {
							delete returnedContext.cache;
							if(context.cache instanceof Function) {
								if(!loadCache[context.rawPath]) {
									loadCache[context.rawPath] = {
										vary: context.cache
									};
								}
								loadCache[context.rawPath][`#${context.cache(context)}`] = returnedContext;
							}
						}
						resolve(returnedContext);
					};
					if(resolution === false) {
						context.done();
					} else {
						func.call(context).catch(err => {
							throw new ServeCubeError(`An error occured while executing \`${fullPath}\`.\n${err.stack}`);
						});
					}
				});
			} else {
				return {
					value: await fs.readFile(fullPath)
				};
			}
		};
		const renderLoad = cube.renderLoad = async (path, req, res) => {
			if(!res.get("Content-Type")) {
				res.set("Content-Type", "text/html");
			}
			const context = {
				req,
				res,
				method: req.method
			};
			const result = await load(path, context);
			if(result.redirect) {
				res.redirect(result.status || 307, result.redirect);
			} else {
				res.status(result.status || (req.method === "POST" ? 201 : 200));
				res.send(result.value);
			}
		};
		const renderError = cube.renderError = async (status, req, res) => {
			res.status(status);
			const stringStatus = String(status);
			if(options.errorDir) {
				const path = `${options.errorDir}/${stringStatus}`;
				const {rawPath} = await getRawPath(path, req.method);
				if(rawPath) {
					renderLoad(path, req, res);
				} else {
					res.send(stringStatus);
				}
			} else {
				res.send(stringStatus);
			}
		};
		app.use(bodyParser.raw({
			limit: "100mb",
			type: "*/*"
		}));
		app.disable("X-Powered-By");
		if(options.preMiddleware instanceof Array) {
			for(const v of options.preMiddleware) {
				if(v instanceof Function) {
					app.use(v);
				}
			}
		}
		app.use(async (req, res) => {
			res.set("X-Powered-By", "ServeCube");
			res.set("X-Frame-Options", "SAMEORIGIN");
			res.set("Vary", "Origin");
			const origin = req.get("Origin");
			if(origin && originTest.test(origin)) {
				res.set("Access-Control-Allow-Origin", origin);
				const requestHeaders = req.get("Access-Control-Request-Headers");
				if(requestHeaders) {
					res.set("Access-Control-Allow-Headers", requestHeaders);
				}
				res.set("Access-Control-Allow-Credentials", "true");
			}
			let redirect = false;
			if(options.httpsRedirect && req.protocol === "http") {
				redirect = "https://";
			}
			try {
				req.decodedURL = decodeURIComponent(req.url);
			} catch(err) {
				renderError(400, req, res);
				return;
			}
			const subdomain = options.subdomains[req.subdomain = req.subdomains.join(".")] === undefined ? options.subdomains["*"] : options.subdomains[req.subdomain];
			if(!redirect && options.githubSecret && req.subdomain === options.githubSubdomain && req.decodedURL === options.githubPayloadURL) {
				const signature = req.get("X-Hub-Signature");
				if(signature && signature === `sha1=${crypto.createHmac("sha1", options.githubSecret).update(req.body).digest("hex")}`) {
					if(req.get("X-GitHub-Event") !== "push") {
						res.send();
						return;
					}
					const payload = JSON.parse(req.body);
					const branch = payload.ref.slice(payload.ref.lastIndexOf("/")+1);
					if(branch !== "master") {
						res.send();
						return;
					}
					const files = {};
					for(const v of payload.commits) {
						for(const w of v.removed) {
							files[w] = 1;
						}
						for(const w of v.modified) {
							files[w] = 2;
						}
						for(const w of v.added) {
							files[w] = 3;
						}
					}
					for(const i of Object.keys(files)) {
						const fullPath = options.basePath + i;
						try {
							limb(i);
						} catch(err) {}
						if(files[i] === 1) {
							if(await fs.exists(fullPath)) {
								await fs.unlink(fullPath);
								const type = mime.getType(i);
								if(type === "application/javascript" || type === "text/css") {
									const mapPath = `${fullPath}.map`;
									if(await fs.exists(mapPath)) {
										await fs.unlink(mapPath);
									}
								}
							}
							let index = i.length;
							while((index = i.lastIndexOf("/", index)-1) !== -2) {
								const path = options.basePath + i.slice(0, index+1);
								if(await fs.exists(path)) {
									try {
										await fs.rmdir(path);
									} catch(err) {
										break;
									}
								}
							}
						} else if(files[i] === 2 || files[i] === 3) {
							let file;
							try {
								file = JSON.parse(await request.get(`https://api.github.com/repos/${payload.repository.full_name}/contents/${i}?ref=${branch}`, requestOptions));
							} catch(err) {
								console.error(err);
								continue;
							}
							let contents = Buffer.from(file.content, file.encoding);
							let index = 0;
							while(index = i.indexOf("/", index)+1) {
								const nextPath = options.basePath + i.slice(0, index-1);
								if(!await fs.exists(nextPath)) {
									await fs.mkdir(nextPath);
								}
							}
							if(njsExtTest.test(i)) {
								contents = minifyHTMLInJS(String(contents));
							} else if(htmlExtTest.test(i)) {
								contents = minifyHTML(String(contents));
							} else {
								let publicDir = false;
								for(const v of Object.values(dirs)) {
									if(i.startsWith(v)) {
										publicDir = v;
										break;
									}
								}
								if(publicDir) {
									const type = mime.getType(i);
									if(type === "application/javascript") {
										const originalContents = minifyHTMLInJS(String(contents));
										await fs.writeFile(`${fullPath}.source`, originalContents);
										const filenameIndex = i.lastIndexOf("/")+1;
										const filename = i.slice(filenameIndex);
										const compiled = babel.transform(originalContents, {
											ast: false,
											comments: false,
											compact: true,
											filename,
											minified: true,
											presets: ["env"],
											sourceMaps: true,
											sourceType: "script"
										});
										const result = UglifyJS.minify(compiled.code, {
											parse: {
												html5_comments: false
											},
											compress: {
												passes: 2
											},
											sourceMap: {
												content: JSON.stringify(compiled.map),
												root: i.slice(publicDir.length, filenameIndex)
											}
										});
										contents = result.code;
										const sourceMap = JSON.parse(result.map);
										sourceMap.sources = [`${filename}.source`];
										await fs.writeFile(`${fullPath}.map`, JSON.stringify(sourceMap));
										await replant(`${i}.source`);
										await replant(`${i}.map`);
									} else if(type === "text/css") {
										const originalContents = String(contents);
										await fs.writeFile(`${fullPath}.source`, originalContents);
										const mapPath = `${fullPath}.map`;
										const result = sass.renderSync({
											data: originalContents,
											outFile: mapPath,
											sourceMap: true
										});
										const output = cleaner.minify(String(result.css), String(result.map));
										contents = output.styles;
										const sourceMap = JSON.parse(output.sourceMap);
										const filenameIndex = i.lastIndexOf("/")+1;
										sourceMap.sourceRoot = i.slice(publicDir.length, filenameIndex);
										sourceMap.sources = [`${i.slice(filenameIndex)}.source`];
										await fs.writeFile(mapPath, JSON.stringify(sourceMap));
										await replant(`${i}.source`);
										await replant(`${i}.map`);
									}
								}
							}
							await fs.writeFile(fullPath, contents);
							try {
								await replant(i);
							} catch(err) {}
						}
					}
					res.send();
					if(files["package.json"] || files[process.mainModule.filename.slice(process.cwd().length+1)]) {
						if(files["package.json"]) {
							childProcess.spawnSync("npm", ["install"]);
						}
						process.exit();
					}
				} else {
					renderError(403, req, res);
				}
				return;
			} else if(subdomain.endsWith(".")) {
				if(redirect === false) {
					redirect = `${req.protocol}://`;
				}
				if(subdomain !== ".") {
					redirect += subdomain;
				}
			} else {
				req.dir = subdomain.slice(0, -1);
			}
			const queryIndex = (req.queryIndex = req.decodedURL.indexOf("?"))+1;
			req.decodedPath = req.decodedURL.slice(0, !queryIndex ? undefined : req.queryIndex);
			req.queryString = queryIndex ? req.decodedURL.slice(queryIndex, req.decodedURL.length) : undefined;
			let url = req.decodedPath;
			for(const v of urlReplacements) {
				url = url.replace(...v);
			}
			if(queryIndex) {
				url += `?${req.queryString}`;
			}
			if(req.decodedURL !== url) {
				if(redirect === false) {
					redirect = url;
				} else {
					redirect += options.domain + url;
				}
			} else if(redirect !== false) {
				redirect += options.domain + req.decodedURL;
			}
			if(redirect !== false) {
				res.redirect(308, redirect);
				return;
			} else {
				const {rawPath, hasIndex, methods, methodNotAllowed} = await getRawPath(req.dir + req.decodedPath, req.method);
				let allowedMethods = methods ? methods.join(", ") : (rawPath ? (pageExtTest.test(rawPath) ? allMethodsString : "GET") : "");
				if(allowedMethods) {
					allowedMethods = `OPTIONS, ${allowedMethods}`;
					res.set("Allow", allowedMethods);
					if(origin) {
						res.set("Access-Control-Allow-Methods", allowedMethods);
					}
				}
				req.rawPath = rawPath;
				if(req.method === "OPTIONS") {
					res.send();
					return;
				}
				if(!rawPath) {
					if(hasIndex) {
						res.redirect(308, req.queryString === undefined ? `${req.decodedURL}/` : `${req.decodedURL.slice(0, req.queryIndex)}/${req.decodedURL.slice(req.queryIndex)}`);
						return;
					} else if(methodNotAllowed) {
						renderError(405, req, res);
						return;
					}
				}
				req.next();
			}
		});
		if(options.middleware instanceof Array) {
			for(const v of options.middleware) {
				if(v instanceof Function) {
					app.use(v);
				}
			}
		}
		app.all("*", async (req, res) => {
			if(req.rawPath) {
				if(njsExtTest.test(req.rawPath)) {
					if(!res.get("Content-Type")) {
						res.set("Content-Type", mime.getType(req.rawPath.replace(njsExtTest, "")) || "text/html");
					}
					renderLoad(req.dir + req.decodedPath, req, res);
				} else if(req.method === "GET") {
					if(!res.get("Cache-Control")) {
						res.set("Cache-Control", "max-age=86400");
					}
					const type = mime.getType(req.rawPath);
					if(type) {
						res.set("Content-Type", type);
						if(type === "application/javascript" || type === "text/css") {
							res.set("SourceMap", `${req.decodedPath}.map`);
						}
					}
					fs.createReadStream(options.basePath + req.rawPath).pipe(res);
				} else {
					renderError(405, req, res);
				}
			} else {
				renderError(404, req, res);
			}
		});
		http.createServer(app).listen(options.httpPort);
		if(options.tls instanceof Object) {
			https.createServer(options.tls, app).listen(options.httpsPort);
		}
		return cube;
	}
};
