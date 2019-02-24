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
const package = require("./package.json");
const pathToRegexpOptions = {
	sensitive: true,
	strict: true
};
const cleaner = new CleanCSS({
	inline: false,
	sourceMap: true
});
mime.define({
	"text/html": ["njs"],
	"text/css": ["scss"]
}, true);
const ServeCubeError = class ServeCubeError extends Error {
	constructor() {
		const err = super(...arguments);
		err.name = "ServeCubeError";
		return err;
	}
}
const AsyncFunction = (async () => {}).constructor;
const emptyString = () => "";
const backslashes = /\\/g;
const brs = /\n/g;
const whitespace = /\s+/g;
const escapeRegExpTest = /([\\()[|{^$.+*?])/g;
const escapeRegExp = str => str.replace(escapeRegExpTest, "\\$1");
const pageExtExp = "\\.(?:.*\\.)?(?:[Nn][Jj][Ss]|[Hh][Tt][Mm][Ll]?)$";
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
const htmlReplacements = [[/&/g, "&amp;"], [/</g, "&lt;"], [/>/g, "&gt;"], [/"/g, "&quot;"], [/'/g, "&#39;"], [/`/g, "&#96;"]];
const urlReplacements = [[/\/\.{1,2}\//g, "/"], [/[\\\/]+/g, "/"], [pageExtTest, ""], [/\/index$/i, "/"]];
const byFirstItems = parentEntry => parentEntry[0];
const byNames = param => param.name;
const byNoLastItems = dir => dir.slice(0, -1);
const byUniqueDirectories = (dir, i, dirs) => dir.endsWith("/") && dirs.indexOf(dir) === i;
const slashesOnEndsTest = /^\/*(.*?)\/*$/;
const cleanDir = value => typeof value === "string" ? value.replace(slashesOnEndsTest, "$1/") : undefined;
const minifyHTML = code => code.replace(brs, "").replace(whitespace, " ");
const minifyHTMLInJS = code => {
	code = code.split(htmlTest);
	for (let i = 1; i < code.length; i += 2) {
		code[i] = minifyHTML(code[i]);
	}
	return code.join("");
};
const _depth = Symbol("depth");
const ServeCubeContext = class ServeCubeContext {
	constructor(obj) {
		if (obj instanceof Object) {
			Object.assign(this, obj);
		}
		this[_depth] = typeof this.depth === "number" ? this.depth : 0;
	}
	get depth() {
		return this[_depth];
	}
}
const html = (strs, ...exps) => {
	let str = strs[0];
	for (let i = 0; i < exps.length; i++) {
		let code = String(exps[i]);
		if (strs[i].slice(-1) === "$") {
			str = str.slice(0, -1);
			code = html.escape(code);
		}
		str += code + strs[i + 1];
	}
	return str;
};
html.escape = code => {
	if (typeof code !== "string") {
		throw new MiroError("The `code` parameter must be a string.");
	}
	for (const htmlReplacement of htmlReplacements) {
		code = code.replace(...htmlReplacement);
	}
	return code;
};
const ServeCube = module.exports = {
	html,
	ServeCubeContext, 
	serve: async options => {
		const cube = {};
		if (!(options instanceof Object)) {
			throw new ServeCubeError("The `options` parameter must be an object.");
		}
		if (typeof options.domain !== "string") {
			throw new ServeCubeError("The `domain` option must be a string.");
		}
		options = {...options};
		if (!(options.eval instanceof Function)) {
			options.eval = eval;
		}
		if (typeof options.basePath !== "string") {
			options.basePath = `${process.cwd()}/`;
		} else if (!options.basePath.endsWith("/")) {
			options.basePath = `${options.basePath}/`;
		}
		options.basePath = options.basePath.replace(backslashes, "/");
		options.errorDir = cleanDir(options.errorDir);
		if (options.loadDirs) {
			options.loadDirs = options.loadDirs.map(cleanDir);
		}
		if (typeof options.httpPort !== "number") {
			options.httpPort = 8080;
		}
		if (options.tls instanceof Object) {
			if (typeof options.httpsPort !== "number") {
				options.httpsPort = 8443;
			}
		} else {
			delete options.tls;
		}
		options.httpsRedirect = options.httpsRedirect === false ? false : !!(options.httpsRedirect || options.tls);
		if (options.subdomains instanceof Object) {
			for (const subdomain of Object.keys(options.subdomains)) {
				if (subdomainTest.test(subdomain)) {
					if (typeof options.subdomains[subdomain] !== "string") {
						throw new ServeCubeError(`The subdomain value associated with \`${subdomain}\` is not a string.`);
					} else if (!subdomainValueTest.test(options.subdomains[subdomain])) {
						throw new ServeCubeError(`"${options.subdomains[subdomain]}" is not a valid subdomain value.`);
					}
				} else {
					throw new ServeCubeError(`"${subdomain}" is not a valid subdomain.`);
				}
			}
		} else {
			options.subdomains = {};
		}
		if (options.subdomains["*"] === undefined) {
			if (options.subdomains[""] === undefined) {
				options.subdomains[""] = "www/";
			}
			options.subdomains["*"] = ".";
		}
		if (typeof options.githubSecret === "string") {
			if (options.githubSubdomain === undefined) {
				options.githubSubdomain = "";
			}
		} else {
			options.githubSecret = false;
		}
		if (!(options.loadStart instanceof Array)) {
			delete options.loadStart;
		}
		if (!(options.loadEnd instanceof Array)) {
			delete options.loadEnd;
		}
		const requestOptions = {
			headers: {
				"User-Agent": `ServeCube/${package.version}`
			}
		};
		if (typeof options.githubToken === "string") {
			requestOptions.headers.Authorization = `token ${options.githubToken}`;
		}
		if (!(options.babelOptions instanceof Object)) {
			options.babelOptions = {};
		}
		const originTest = new RegExp(`^https?://(?:.+\\.)?${escapeRegExp(options.domain)}$`);
		const app = cube.app = express();
		app.set("trust proxy", true);
		if (!options.domain.includes(".")) {
			app.set("subdomain offset", 1);
		}
		const tree = cube.tree = {};
		const getPaths = (path, paramName) => {
			if (typeof path !== "string") {
				throw new ServeCubeError(`The \`${paramName || "path"}\` parameter must be a string.`);
			}
			const output = {};
			if (!(output.dir = (output.paths = path.split("/")).shift())) {
				throw new ServeCubeError("The provided path contains no base directory.");
			}
			if (!tree[output.dir]) {
				throw new ServeCubeError(`The provided base directory, \`${output.dir}\`, is not planted.`);
			}
			return output;
		};
		const getRawPath = cube.getRawPath = async (path, method) => {
			method = typeof method === "string" ? method.toUpperCase() : "GET";
			const {dir, paths} = getPaths(path);
			const lastPath = paths[paths.length - 1];
			if (allMethods.includes(lastPath) && method !== lastPath) {
				return {
					forbidden: true
				};
			}
			let parent = tree[dir];
			const output = {
				rawPath: dir,
				branches: [dir]
			};
			while (paths.length) {
				let child;
				if (paths[0] === "") {
					if (parent.index) {
						child = parent.index;
					} else {
						delete output.rawPath;
						break;
					}
				} if (parent.children[paths[0]] && !parent.children[paths[0]].test) {
					child = paths[0];
				} else {
					for (const nextChild of Object.keys(parent.children)) {
						if (parent.children[nextChild].test) {
							let matches = paths[0].match(parent.children[nextChild].test);
							if (matches) {
								child = nextChild;
								if (!output.params) {
									output.params = {};
								}
								for (let i = 0; i < parent.children[nextChild].params.length; i++) {
									output.params[parent.children[nextChild].params[i]] = matches[i + 1];
								}
								break;
							}
						} else if (pageExtTest.test(nextChild) && paths[0] === nextChild.replace(pageExtTest, "")) {
							child = nextChild;
							break;
						}
					}
				}
				if (child) {
					
					if (paths.length === 1) {
						if (parent.children[child].methods) {
							output.methods = Object.keys(parent.children[child].methods);
							if (parent.children[child].methods[method]) {
								output.rawPath += `/${child}`;
								output.branches.push(child = (parent = parent.children[child]).methods[method]);
							} else {
								output.methodNotAllowed = true;
								delete output.rawPath;
								break;
							}
						}
						output.rawPath += `/${child}`;
						output.hasIndex = !!parent.children[child].index;
						output.func = parent.children[child].func;
						output.branches.push(child);
						break;
					} else if (!parent.children[child].children) {
						output.rawPath += `/${child}`;
						output.branches.push(child);
						break;
					}
					output.rawPath += `/${child}`;
					parent = parent.children[child];
					output.branches.push(child);
					paths.shift();
				} else {
					delete output.rawPath;
					break;
				}
			}
			if (paths.length !== 1) {
				delete output.rawPath;
			}
			if (output.rawPath) {
				const fullPath = options.basePath + output.rawPath;
				if (!await fs.exists(fullPath)) {
					throw new ServeCubeError(`The file \`${fullPath}\` is planted but was not found.`);
				} else if ((await fs.stat(fullPath)).isDirectory()) {
					delete output.rawPath;
				}
			}
			return output;
		};
		const plantChild = async (parent, child, isDir, fullPath) => {
			parent.children[child] = {};
			if (!isDir && pageExtTest.test(child)) {
				if (indexTest.test(child)) {
					parent.index = child;
				} else if (methodAllTest.test(child)) {
					if (!parent.methods) {
						parent.methods = {};
					}
					for (const method of allMethods) {
						if (!parent.methods[method]) {
							parent.methods[method] = child;
						}
					}
				} else {
					const methods = child.match(methodTest);
					if (methods) {
						if (!parent.methods) {
							parent.methods = {};
						}
						for (let i = 1; i < methods.length; i++) {
							if (methods[i]) {
								parent.methods[methods[i]] = child;
							}
						}
					}
				}
			}
			const params = [];
			const re = pathToRegexp(child.replace(pageExtTest, "").replace(templateTest, ":$1"), params, pathToRegexpOptions);
			if (params.length) {
				parent.children[child].params = params.map(byNames);
				parent.children[child].test = re;
			}
			if (isDir) {
				parent.children[child].children = {};
			} else if (njsExtTest.test(child)) {
				try {
					parent.children[child].func = options.eval(`(async function() {${await fs.readFile(fullPath)}})`);
				} catch (err) {
					throw new ServeCubeError(`An error occured while evaluating \`${fullPath}\`.\n${err.stack}`);
				}
				if (!(parent.children[child].func instanceof AsyncFunction)) {
					throw new ServeCubeError("The `eval` option must return the evaluated input, which should always be an async function.");
				}
			}
		}
		const plant = async (parent, path) => {
			const children = await fs.readdir(options.basePath + path);
			for (const filename of children) {
				const childPath = `${path}/${filename}`;
				const fullPath = options.basePath + childPath;
				const isDir = (await fs.stat(fullPath)).isDirectory();
				await plantChild(parent, filename, isDir, fullPath);
				if (isDir) {
					await plant(parent.children[filename], childPath);
				}
			}
		};
		const limb = cube.limb = rawPath => {
			const {dir, paths} = getPaths(rawPath, "rawPath");
			let parent = tree[dir];
			const parents = [[dir, parent]];
			while (paths.length) {
				const child = paths.shift();
				if (parent.children && parent.children[child]) {
					parents.unshift([child, parent = parent.children[child]]);
				} else {
					throw new ServeCubeError(`The file \`${parents.map(byFirstItems).join("/")}/${child}\` is not planted.`);
				}
			}
			if (parents[0][1].children) {
				const dirPath = `${rawPath}/`;
				for (const rawPath of Object.keys(loadCache)) {
					if (rawPath.startsWith(dirPath)) {
						delete loadCache[rawPath];
					}
				}
			}
			delete loadCache[rawPath];
			while (parents.length) {
				const child = parents.shift()[0];
				if (parents[0][1].index === child) {
					delete parents[0][1].index;
				}
				if (parents[0][1].methods) {
					for (const method of Object.keys(parents[0][1].methods)) {
						if (parents[0][1].methods[method] === child) {
							delete parents[0][1].methods[method];
						}
					}
					if (!Object.keys(parents[0][1].methods).length) {
						delete parents[0][1].methods;
					}
				}
				delete parents[0][1].children[child];
				if (Object.keys(parents[0][1].children).length) {
					break;
				}
			}
		};
		const replant = cube.replant = async rawPath => {
			const {dir, paths} = getPaths(rawPath, "rawPath");
			let parent = tree[dir];
			while (paths.length) {
				if (parent) {
					if (parent.children) {
						if (parent.children[paths[0]]) {
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
			if (!paths.length) {
				limb(rawPath);
				return replant(rawPath);
			}
			const fullPath = options.basePath + rawPath;
			if (!await fs.exists(fullPath)) {
				throw new ServeCubeError(`The file \`${fullPath}\` was not found.`);
			} else if ((await fs.stat(fullPath)).isDirectory()) {
				throw new ServeCubeError(`The file \`${fullPath}\` is a directory.`);
			}
			while (paths.length - 1) {
				const child = paths.shift();
				await plantChild(parent, child, true);
				parent = parent.children[child];
			}
			await plantChild(parent, paths[0], false, fullPath);
		};
		let dirs = Object.values(options.subdomains);
		if (options.errorDir) {
			dirs.push(options.errorDir);
		}
		if (options.loadDirs) {
			dirs.push(...options.loadDirs);
		}
		for (const dir of dirs = dirs.filter(byUniqueDirectories).map(byNoLastItems)) {
			await plant(tree[dir] = {
				children: {}
			}, dir);
		}
		const loadCache = cube.loadCache = {};
		const load = cube.load = async (path, context) => {
			if (!(context instanceof Object)) {
				context = {};
			}
			const {rawPath, params, func} = await getRawPath(path, context.method);
			if (!rawPath) {
				throw new ServeCubeError(`The file \`${path}\` is not planted.`);
			}
			const fullPath = options.basePath + rawPath;
			if (func) {
				if (context) {
					context = new ServeCubeContext({
						...context
					});
					// Delete properties which may not be passed into loaded context.
					delete context.done;
					delete context.value;
					delete context.status;
					delete context.redirect;
					delete context.cache;
				} else {
					context = new ServeCubeContext();
				}
				Object.assign(context, {
					rawPath,
					params
				});
				context[_depth]++;
				context.value = "";
				let cacheIndex;
				return loadCache[context.rawPath] && loadCache[context.rawPath][cacheIndex = `#${loadCache[context.rawPath].vary(context)}`] ? {
					...context,
					...loadCache[context.rawPath][cacheIndex]
				} : await new Promise(async (resolve, reject) => {
					let resolution;
					if (options.loadStart) {
						for (const func of options.loadStart) {
							if (func instanceof Function) {
								resolution = func(context);
								if (resolution instanceof Promise) {
									resolution = await resolution;
								}
								if (resolution === false) {
									break;
								}
							}
						}
					}
					context.done = async () => {
						if (options.loadEnd) {
							for (const func of options.loadEnd) {
								if (func instanceof AsyncFunction) {
									await func(context);
								} else if (func instanceof Function) {
									func(context);
								}
							}
						}
						const returnedContext = {
							...context
						};
						context[_depth]--;
						// Delete properties which are not included in resolved context.
						delete returnedContext.rawPath;
						delete returnedContext.done;
						delete returnedContext.req;
						delete returnedContext.res;
						delete returnedContext.method;
						delete returnedContext.params;
						if (context.cache) {
							delete returnedContext.cache;
							if (!(context.cache instanceof Function)) {
								context.cache = emptyString;
							}
							if (!loadCache[context.rawPath]) {
								loadCache[context.rawPath] = {
									vary: context.cache
								};
							}
							loadCache[context.rawPath][`#${context.cache(context)}`] = returnedContext;
						}
						resolve(returnedContext);
					};
					if (resolution === false) {
						context.done();
					} else {
						try {
							await func.call(context);
						} catch (err) {
							throw new ServeCubeError(`An error occured while executing \`${fullPath}\`.\n${err.stack}`);
						}
					}
				});
			} else {
				return {
					value: await fs.readFile(fullPath)
				};
			}
		};
		const renderLoad = cube.renderLoad = async (path, req, res) => {
			if (!res.get("Content-Type")) {
				res.set("Content-Type", "text/html");
			}
			const context = new ServeCubeContext({
				req,
				res,
				method: req.method
			});
			const result = await load(path, context);
			if (result.redirect) {
				res.redirect(result.status || 307, result.redirect);
			} else {
				res.status(result.status || (res.statusCode === 200 ? (req.method === "POST" ? 201 : 200) : res.statusCode));
				if (result.value) {
					let value;
					if (typeof result.value === "string" || result.value instanceof Buffer) {
						({value} = result);
					} else {
						try {
							value = JSON.stringify(result.value);
						} catch (err) {
							throw new ServeCubeError(`An error occured while evaluating \`${options.basePath + req.rawPath}\`.\n${err.stack}`);
						}
					}
					res.set("Content-Length", value.length).send(value);
				} else {
					res.send();
				}
			}
		};
		const renderError = cube.renderError = async (status, req, res) => {
			if (options.errorDir) {
				const path = options.errorDir + status;
				const {rawPath} = await getRawPath(path, req.method);
				if (rawPath) {
					res.status(status);
					renderLoad(path, req, res);
				} else {
					res.sendStatus(status);
				}
			} else {
				res.sendStatus(status);
			}
		};
		app.use(bodyParser.raw({
			limit: "100mb",
			type: "*/*"
		}));
		app.disable("X-Powered-By");
		if (options.preMiddleware instanceof Array) {
			for (const func of options.preMiddleware) {
				if (func instanceof Function) {
					app.use(func);
				}
			}
		}
		app.use(async (req, res) => {
			res.set("X-Powered-By", "ServeCube");
			res.set("X-Frame-Options", "SAMEORIGIN");
			res.set("Vary", "Origin");
			const origin = req.get("Origin");
			if (origin && originTest.test(origin)) {
				res.set("Access-Control-Allow-Origin", origin);
				const requestHeaders = req.get("Access-Control-Request-Headers");
				if (requestHeaders) {
					res.set("Access-Control-Allow-Headers", requestHeaders);
				}
				res.set("Access-Control-Allow-Credentials", "true");
			}
			let redirect = false;
			if (options.httpsRedirect && req.protocol === "http") {
				redirect = "https://";
			}
			try {
				req.decodedURL = decodeURIComponent(req.url);
			} catch (err) {
				renderError(400, req, res);
				return;
			}
			const subdomain = options.subdomains[req.subdomain = req.subdomains.join(".")] === undefined ? options.subdomains["*"] : options.subdomains[req.subdomain];
			if (!redirect && options.githubSecret && req.subdomain === options.githubSubdomain && req.decodedURL === options.githubPayloadURL) {
				const signature = req.get("X-Hub-Signature");
				if (signature && signature === `sha1=${crypto.createHmac("sha1", options.githubSecret).update(req.body).digest("hex")}`) {
					if (req.get("X-GitHub-Event") !== "push") {
						res.send();
						return;
					}
					const payload = JSON.parse(req.body);
					const branch = payload.ref.slice(payload.ref.lastIndexOf("/") + 1);
					if (branch !== "master") {
						res.send();
						return;
					}
					const files = {};
					for (const commit of payload.commits) {
						for (const removed of commit.removed) {
							files[removed] = 1;
						}
						for (const modified of commit.modified) {
							files[modified] = 2;
						}
						for (const added of commit.added) {
							files[added] = 3;
						}
					}
					for (const committed of Object.keys(files)) {
						try {
							const fullPath = options.basePath + committed;
							try {
								limb(committed);
							} catch (err) {}
							if (files[committed] === 1) {
								if (await fs.exists(fullPath)) {
									await fs.unlink(fullPath);
									const type = mime.getType(committed);
									if (type === "application/javascript" || type === "text/css") {
										const mapCommitted = `${committed}.map`;
										const mapPath = options.basePath + mapCommitted;
										if (await fs.exists(mapPath)) {
											limb(mapCommitted);
											await fs.unlink(mapPath);
										}
										const sourceCommitted = `${committed}.source`;
										const sourcePath = options.basePath + sourceCommitted;
										if (await fs.exists(sourcePath)) {
											limb(sourceCommitted);
											await fs.unlink(sourcePath);
										}
									}
								}
								let index = committed.length;
								while ((index = committed.lastIndexOf("/", index) - 1) !== -2) {
									const path = options.basePath + committed.slice(0, index + 1);
									if (await fs.exists(path)) {
										try {
											await fs.rmdir(path);
										} catch (err) {
											break;
										}
									}
								}
							} else if (files[committed] === 2 || files[committed] === 3) {
								const file = JSON.parse(await request.get(`https://api.github.com/repos/${payload.repository.full_name}/contents/${committed}?ref=${branch}`, requestOptions));
								let contents = Buffer.from(file.content, file.encoding);
								let index = 0;
								while (index = committed.indexOf("/", index) + 1) {
									const nextPath = options.basePath + committed.slice(0, index - 1);
									if (!await fs.exists(nextPath)) {
										await fs.mkdir(nextPath);
									}
								}
								if (njsExtTest.test(committed)) {
									contents = minifyHTMLInJS(String(contents));
								} else if (htmlExtTest.test(committed)) {
									contents = minifyHTML(String(contents));
								} else {
									let publicDir = false;
									for (const dir of Object.values(dirs)) {
										if (committed.startsWith(dir)) {
											publicDir = dir;
											break;
										}
									}
									const type = mime.getType(committed);
									const typeIsJS = type === "application/javascript";
									if (publicDir) {
										if (typeIsJS) {
											const originalContents = minifyHTMLInJS(String(contents));
											await fs.writeFile(`${fullPath}.source`, originalContents);
											const filenameIndex = committed.lastIndexOf("/") + 1;
											const filename = committed.slice(filenameIndex);
											const compiled = babel.transform(originalContents, {
												ast: false,
												comments: false,
												compact: true,
												filename,
												minified: true,
												presets: ["@babel/preset-env"],
												sourceMaps: true,
												sourceType: "script",
												...options.babelOptions
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
													root: committed.slice(publicDir.length, filenameIndex)
												}
											});
											contents = result.code;
											const sourceMap = JSON.parse(result.map);
											sourceMap.sources = [`${filename}.source`];
											await fs.writeFile(`${fullPath}.map`, JSON.stringify(sourceMap));
											await replant(`${committed}.source`);
											await replant(`${committed}.map`);
										} else if (type === "text/css") {
											const originalContents = String(contents);
											await fs.writeFile(`${fullPath}.source`, originalContents);
											const mapPath = `${fullPath}.map`;
											const result = sass.renderSync({
												data: originalContents || " ",
												outFile: mapPath,
												sourceMap: true
											});
											const output = cleaner.minify(String(result.css), String(result.map));
											contents = output.styles;
											const sourceMap = JSON.parse(output.sourceMap);
											const filenameIndex = committed.lastIndexOf("/") + 1;
											sourceMap.sourceRoot = committed.slice(publicDir.length, filenameIndex);
											sourceMap.sources = [`${committed.slice(filenameIndex)}.source`];
											await fs.writeFile(mapPath, JSON.stringify(sourceMap));
											await replant(`${committed}.source`);
											await replant(`${committed}.map`);
										}
									} else if (typeIsJS) {
										contents = minifyHTMLInJS(String(contents));
									}
								}
								await fs.writeFile(fullPath, contents);
								try {
									await replant(committed);
								} catch (err) {}
							}
						} catch (err) {
							console.error(err);
							continue;
						}
					}
					res.send();
					if (files["package.json"] || files[process.mainModule.filename.slice(process.cwd().length + 1)]) {
						if (files["package.json"]) {
							childProcess.spawnSync("npm", ["install"]);
						}
						process.exit();
					}
				} else {
					renderError(403, req, res);
				}
				return;
			} else if (subdomain.endsWith(".")) {
				if (redirect === false) {
					redirect = `${req.protocol}://`;
				}
				if (subdomain !== ".") {
					redirect += subdomain;
				}
			} else {
				req.dir = subdomain.slice(0, -1);
			}
			const queryIndex = (req.queryIndex = req.decodedURL.indexOf("?")) + 1;
			req.decodedPath = req.decodedURL.slice(0, !queryIndex ? undefined : req.queryIndex);
			req.queryString = queryIndex ? req.decodedURL.slice(queryIndex, req.decodedURL.length) : undefined;
			let url = req.decodedPath;
			for (const args of urlReplacements) {
				url = url.replace(...args);
			}
			if (queryIndex) {
				url += `?${req.queryString}`;
			}
			if (req.decodedURL !== url) {
				if (redirect === false) {
					redirect = url;
				} else {
					redirect += options.domain + url;
				}
			} else if (redirect !== false) {
				redirect += options.domain + req.decodedURL;
			}
			if (redirect !== false) {
				res.redirect(308, redirect);
				return;
			} else {
				const {rawPath, branches, hasIndex, methods, forbidden, methodNotAllowed} = await getRawPath(req.dir + req.decodedPath, req.method);
				let allowedMethods = methods ? methods.join(", ") : (rawPath ? (pageExtTest.test(rawPath) ? allMethodsString : "GET") : "");
				if (allowedMethods) {
					allowedMethods = `OPTIONS, ${allowedMethods}`;
					res.set("Allow", allowedMethods);
					if (origin) {
						res.set("Access-Control-Allow-Methods", allowedMethods);
					}
				}
				req.rawPath = rawPath;
				req.branches = branches;
				if (req.method === "OPTIONS") {
					res.send();
					return;
				}
				if (!rawPath) {
					if (hasIndex) {
						res.redirect(308, req.queryString === undefined ? `${req.decodedURL}/` : `${req.decodedURL.slice(0, req.queryIndex)}/${req.decodedURL.slice(req.queryIndex)}`);
						return;
					} else if (forbidden) {
						renderError(403, req, res);
						return;
					} else if (methodNotAllowed) {
						renderError(405, req, res);
						return;
					}
				}
				req.next();
			}
		});
		if (options.middleware instanceof Array) {
			for (const func of options.middleware) {
				if (func instanceof Function) {
					app.use(func);
				}
			}
		}
		app.all("*", async (req, res) => {
			if (req.rawPath) {
				if (njsExtTest.test(req.rawPath)) {
					if (!res.get("Content-Type")) {
						res.set("Content-Type", mime.getType(req.rawPath.replace(njsExtTest, "")) || "text/html");
					}
					renderLoad(req.dir + req.decodedPath, req, res);
				} else if (req.method === "GET") {
					if (!res.get("Cache-Control")) {
						res.set("Cache-Control", req.rawPath.endsWith(".map") || req.rawPath.endsWith(".source") ? "no-cache" : "max-age=86400");
					}
					const type = mime.getType(req.rawPath);
					if (type) {
						res.set("Content-Type", type);
						if (type === "application/javascript" || type === "text/css") {
							res.set("SourceMap", `${req.decodedPath}.map`);
						}
					}
					const fullPath = options.basePath + req.rawPath;
					res.set("Content-Length", (await fs.stat(fullPath)).size);
					fs.createReadStream(fullPath).pipe(res);
				} else {
					renderError(405, req, res);
				}
			} else {
				renderError(404, req, res);
			}
		});
		http.createServer(app).listen(options.httpPort);
		if (options.tls instanceof Object) {
			https.createServer(options.tls, app).listen(options.httpsPort);
		}
		return cube;
	}
};
