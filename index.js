const fs = require("fs-extra");
const http = require("http");
const https = require("https");
const request = require("request-promise-native");
const express = require("express");
const pathToRegexp = require("path-to-regexp");
const childProcess = require("child_process");
const crypto = require("crypto");
const babel = require("babel-core");
const UglifyJS = require("uglify-js");
const CleanCSS = require("clean-css");
const mime = require("mime");
const pathToRegexpOptions = {
	sensitive: true,
	strict: true
};
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
const backslashes = /\\/g;
const brs = /\n/g;
const whitespace = /\s+/g;
const escapeRegExpTest = /([\\()[|{^$.+*?])/g;
const escapeRegExp = str => str.replace(escapeRegExpTest, "\\$1");
const njsExtTest = /\.njs$/i;
const htmlExtTest = /\.html?$/i;
const pageExtTest = /\.(?:njs|html?)$/i;
const indexTest = /^index\.(?:njs|html?)$/i;
const allMethods = ["GET", "POST", "PUT", "DELETE", "PATCH"];
const allMethodsString = allMethods.join(", ");
const allMethodsExp = `(${allMethods.join("|")})`;
const methodTest = new RegExp(`^${allMethodsExp}(?:, ?${allMethodsExp})?(?:, ?${allMethodsExp})?(?:, ?${allMethodsExp})?(?:, ?${allMethodsExp})?\.(?:[Nn][Jj][Ss]|[Hh][Tt][Mm][Ll]?)$`);
const methodAllTest = /^ALL\.(?:[Nn][Jj][Ss]|[Hh][Tt][Mm][Ll]?)$/;
const templateTest = /\{(\w+)}/g;
const htmlTest = /(html`(?:(?:\${(?:`(?:.*|\n)`|"(?:.*|\n)"|'(?:.*|\n)'|.|\n)*?})|.|\n)*?`)/g;
const subdomainTest = /^(?:\*|[0-9a-z.]*)$/i;
const subdomainValueTest = /^.*[.\/]$/;
const htmlReplacements = [/*[/&/g, "&amp;"], */[/</g, "&lt;"], [/>/g, "&gt;"], [/"/g, "&quot;"], [/'/g, "&#39;"], [/`/g, "&#96;"]];
const urlReplacements = [[/\/\.{1,2}\//g, "/"], [/[\\\/]+/g, "/"], [pageExtTest, ""], [/\/index$/i, "/"]];
const byFirstItems = v => v[0];
const byNames = v => v.name;
const byNoLastItems = v => v.slice(0, -1);
const byUniqueDirectories = (v, i, t) => v.endsWith("/") && t.indexOf(v) === i;
const ServeCube = {
	html: function() {
		let string = arguments[0][0];
		const substitutions = Array.prototype.slice.call(arguments, 1);
		for(let i = 0; i < substitutions.length; i++) {
			let code = String(substitutions[i]);
			for(const v of htmlReplacements) {
				code = code.replace(v[0], v[1]);
			}
			string += code + arguments[0][i+1];
		}
		return string;
	},
	serve: async options => {
		const cube = {};
		options = options instanceof Object ? options : {};
		if(!(options.eval instanceof Function)) {
			options.eval = eval;
		}
		if(typeof options.domain !== "string") {
			throw new ServeCubeError("The `domain` option must be defined.");
		}
		if(typeof options.basePath !== "string") {
			options.basePath = `${process.cwd()}/`;
		} else if(!options.basePath.endsWith("/")) {
			options.basePath = `${options.basePath}/`;
		}
		options.basePath = options.basePath.replace(backslashes, "/");
		if(typeof options.errorDir !== "string") {
			options.errorDir = "error";
		} else if(options.errorDir.endsWith("/")) {
			options.errorDir = options.errorDir.slice(0, -1);
		}
		if(typeof options.serverPath !== "string") {
			options.serverPath = "server.js";
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
					if(!subdomainValueTest.test(options.subdomains[i])) {
						throw new ServeCubeError(`"${options.subdomains[i]}" is not a valid subdomain value.`);
					}
				} else {
					throw new ServeCubeError(`"${options.subdomains[i]}" is not a valid subdomain.`);
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
		if(typeof options.githubSecret !== "string") {
			options.githubSecret = false;
		}
		const requestOptions = {
			headers: {
				"User-Agent": "ServeCube"
			}
		};
		if(typeof options.githubToken === "string") {
			requestOptions.headers.Authorization = `token ${options.githubToken}`;
		}
		const originTest = new RegExp(`^(https?://(?:.+\\.)?${escapeRegExp(options.domain)}(?::\\d{1,5})?)$`);
		const app = cube.app = express();
		app.set("trust proxy", true);
		const getPaths = (path, paramName) => {
			if(typeof path !== "string") {
				throw new ServeCubeError(`The \`${paramName || "path"}\` parameter must be a string.`);
			}
			const output = {};
			if(!(output.dir = (output.paths = path.split("/")).shift())) {
				throw new ServeCubeError("The specified path contains no base directory.");
			}
			return output;
		};
		const tree = cube.tree = {};
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
					throw new ServeCubeError(`An occured while evaluating \`${fullPath}\`.\n${err.name}: ${err.message}`);
				}
				if(!(parent.children[child].func instanceof Function)) {
					throw new ServeCubeError("The `eval` option must return the evaluated input, which should always be a function.");
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
			if(!parent) {
				throw new ServeCubeError(`The specified base directory, \`${dir}\`, is not planted.`);
			}
			const parents = [[dir, parent]];
			while(paths.length) {
				const child = paths.shift();
				if(parent.children && parent.children[child]) {
					parents.unshift([child, parent = parent.children[child]]);
				} else {
					throw new ServeCubeError(`The file \`${parents.map(byFirstItems).join("/")}/${child}\` is not planted.`);
				}
			}
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
		const replant = cube.replant = async path => {
			const {dir, paths} = getPaths(path);
			let parent = tree[dir];
			if(!parent) {
				throw new ServeCubeError(`The specified base directory, \`${dir}\`, is not planted.`);
			}
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
						throw new ServeCubeError(`The file \`${path.split("/").slice(0, -paths.length).join("/")}\` has no children as it is not a directory.`);
					}
				} else {
					break;
				}
			}
			if(!paths.length) {
				throw new ServeCubeError("A file must be limbed before it can be replanted.");
			}
			const fullPath = options.basePath + path;
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
		const getRawPath = cube.getRawPath = async (path, method) => {
			method = method ? method.toUpperCase() : "GET";
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
							output.methods = parent.children[child].methods;
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
				if(!await fs.exists(fullPath) || (await fs.stat(fullPath)).isDirectory()) {
					output.rawPath = undefined;
				}
			}
			return output;
		};
		for(const v of [`${options.errorDir}/`, ...Object.values(options.subdomains)].filter(byUniqueDirectories).map(byNoLastItems)) {
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
			if(func) {
				if(context) {
					context = {
						...context
					};
					delete context.done;
					delete context.cache;
					delete context.value;
				} else {
					context = {};
				}
				Object.assign(context, {
					rawPath,
					params
				});
				context.value = "";
				let cacheIndex;
				return loadCache[context.rawPath] && loadCache[cacheIndex = `:${loadCache[context.rawPath](context)}`] ? {
					...context,
					...loadCache[cacheIndex]
				} : await new Promise((resolve, reject) => {
					context.done = () => {
						const returnedContext = {
							...context
						};
						delete returnedContext.done;
						delete returnedContext.rawPath;
						delete returnedContext.params;
						delete returnedContext.req;
						delete returnedContext.res;
						delete returnedContext.method;
						if(context.cache) {
							delete returnedContext.cache;
							if(context.cache instanceof Function) {
								if(!loadCache[context.rawPath]) {
									loadCache[context.rawPath] = context.cache;
								}
								loadCache[`:${context.cache(context)}`] = returnedContext;
							}
						}
						resolve(returnedContext);
					};
					func.call(context);
				});
			} else {
				return {
					value: await fs.readFile(options.basePath + rawPath)
				};
			}
		};
		const renderLoad = async (path, req, res, status) => {
			res.set("Content-Type", "text/html");
			const result = await load(path, {
				req,
				res,
				status,
				method: req.method,
				headers: {}
			});
			if(result.headers) {
				for(const i of Object.keys(result.headers)) {
					if(result.headers[i]) {
						res.set(i, result.headers[i]);
					}
				}
			}
			if(result.redirect) {
				if(result.status) {
					res.redirect(result.status, result.redirect);
				} else {
					res.redirect(result.redirect);
				}
			} else {
				if(result.status) {
					res.status(result.status);
				}
				res.send(result.value);
			}
		};
		const renderError = async (status, req, res) => {
			res.status(status);
			const path = `${options.errorDir}/${status}`;
			const {rawPath} = await getRawPath(path, req.method);
			if(rawPath) {
				renderLoad(path, req, res, status);
			} else {
				res.send(String(status));
			}
		};
		app.use(async (req, res) => {
			res.set("X-Magic", "real");
			res.set("X-Frame-Options", "SAMEORIGIN");
			res.set("Vary", "Origin");
			const origin = req.get("Origin");
			if(origin && originTest.test(origin)) {
				res.set("Access-Control-Expose-Headers", "X-Magic");
				res.set("Access-Control-Allow-Origin", origin);
			}
			let redirect = false;
			const subdomain = options.subdomains[req.subdomain = req.subdomains.join(".")] === undefined ? options.subdomains["*"] : options.subdomains[req.subdomain];
			if(subdomain.endsWith(".")) {
				redirect = subdomain === "." ? "" : subdomain;
			} else {
				req.dir = subdomain.slice(0, -1);
			}
			if(options.httpsRedirect && req.protocol === "http") {
				redirect = `https://${redirect || ""}`;
			} else if(redirect !== false) {
				redirect = `${req.protocol}://${redirect}`;
			}
			try {
				req.decodedURL = decodeURIComponent(req.url);
			} catch(err) {
				renderError(400, req, res);
				return;
			}
			const queryIndex = (req.queryIndex = req.decodedURL.indexOf("?"))+1;
			req.decodedPath = req.decodedURL.slice(0, !queryIndex ? undefined : req.queryIndex);
			req.queryString = queryIndex ? req.decodedURL.slice(queryIndex, req.decodedURL.length) : undefined;
			let url = req.decodedPath;
			for(const v of urlReplacements) {
				url = url.replace(v[0], v[1]);
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
				res.redirect(redirect);
			} else {
				const {rawPath, hasIndex, methods, methodNotAllowed} = await getRawPath(req.dir + req.decodedPath, req.method);
				let allowedMethods = methods ? Object.keys(methods).join(", ") : (rawPath ? (pageExtTest.test(rawPath) ? allMethodsString : "GET") : "");
				if(allowedMethods) {
					allowedMethods = `OPTIONS, ${allowedMethods}`;
					res.set("Allow", allowedMethods);
					if(origin) {
						res.set("Access-Control-Allow-Methods", allowedMethods);
					}
				}
				if(req.method === "OPTIONS") {
					res.send();
					return;
				}
				if(!rawPath) {
					if(hasIndex) {
						res.redirect(req.queryString === undefined ? `${req.decodedURL}/` : `${req.decodedURL.slice(0, req.queryIndex)}/${req.decodedURL.slice(req.queryIndex)}`); // TODO: the opposite
						return;
					} else if(methodNotAllowed) {
						renderError(405, req, res);
						return;
					}
				}
				req.rawPath = rawPath;
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
			if(options.githubSecret && req.decodedPath === options.githubPayloadURL) {
				const signature = req.get("X-Hub-Signature");
				if(signature && signature === `sha1=${crypto.createHmac("sha1", options.githubSecret).update(req.body).digest("hex")}` && req.get("X-GitHub-Event") === "push") {
					const payload = JSON.parse(req.body);
					const branch = payload.ref.slice(payload.ref.lastIndexOf("/")+1);
					if(branch === "master") {
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
										await fs.unlink(`${fullPath}.map`);
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
								const file = JSON.parse(await request.get(`https://api.github.com/repos/${payload.repository.full_name}/contents/${i}?ref=${branch}`, requestOptions));
								let contents = Buffer.from(file.content, file.encoding);
								let index = 0;
								while(index = i.indexOf("/", index)+1) {
									const nextPath = options.basePath + i.slice(0, index-1);
									if(!await fs.exists(nextPath)) {
										await fs.mkdir(nextPath);
									}
								}
								if(njsExtTest.test(i)) {
									contents = String(contents).split(htmlTest); // TODO: Don't minify content in `textarea` and `pre` tags.
									for(let j = 1; j < contents.length; j += 2) {
										contents[j] = contents[j].replace(brs, "").replace(whitespace, " ");
									}
									contents = contents.join("");
								} else if(htmlExtTest.test(i)) {
									contents = String(contents).replace(brs, "").replace(whitespace, " ");
								} else if(i.startsWith(`${req.dir}/`)) {
									const type = mime.getType(i);
									if(type === "application/javascript") {
										const filename = i.slice(i.lastIndexOf("/")+1);
										const compiled = babel.transform(String(contents), {
											ast: false,
											comments: false,
											compact: true,
											filename,
											minified: true,
											presets: ["env"],
											sourceMaps: true
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
												filename
											}
										});
										contents = result.code;
										await fs.writeFile(`${fullPath}.map`, result.map);
									} else if(type === "text/css") {
										const output = new CleanCSS({
											inline: false,
											sourceMap: true
										}).minify(String(contents));
										contents = output.styles;
										const sourceMap = JSON.parse(output.sourceMap);
										sourceMap.sources = [i.slice(i.lastIndexOf("/")+1)];
										await fs.writeFile(`${fullPath}.map`, JSON.stringify(sourceMap));
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
						res.send();
					}
				} else {
					renderError(503, req, res);
				}
			} else if(req.rawPath) {
				if(njsExtTest.test(req.rawPath)) {
					res.set("Content-Type", mime.getType(req.rawPath.replace(njsExtTest, "")) || "text/html");
					renderLoad(req.dir + req.decodedPath, req, res);
				} else if(req.method === "GET") {
					if(!res.get("Cache-Control")) {
						res.set("Cache-Control", "max-age=86400");
					}
					const type = mime.getType(req.rawPath);
					res.set("Content-Type", type);
					if(type === "application/javascript" || type === "text/css") {
						res.set("SourceMap", `${req.decodedPath.slice(req.decodedPath.lastIndexOf("/")+1)}.map`);
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
		if(options.tls) {
			https.createServer(options.tls, app).listen(options.httpsPort);
		}
		return cube;
	}
};
module.exports = ServeCube;
