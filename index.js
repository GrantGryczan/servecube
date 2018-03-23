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
	constructor(message) {
		const err = super(message);
		err.name = "ServeCubeError";
		return err;
	}
}
const backslashes = /\\/g;
const brs = /\n/g;
const whitespace = /\s+/g;
const pageTest = /\.(?:njs|html?)$/;
const templateTest = /\{(\w+)}/g;
const htmlTest = /(html`(?:(?:\${(?:`(?:.*|\n)`|"(?:.*|\n)"|'(?:.*|\n)'|.|\n)*?})|.|\n)*?`)/g;
const subdomainTest = /^(?:\*|[0-9a-z.]*)$/i;
const subdomainValueTest = /^.*[.\/]$/;
const ServeCube = {
	htmlReplacements: [[/&/g, "&amp;"], [/</g, "&lt;"], [/>/g, "&gt;"], [/"/g, "&quot;"], [/'/g, "&#39;"], [/`/g, "&#96;"]],
	urlReplacements: [[/\/\.{1,2}\//g, "/"], [/[\\\/]+/g, "/"], [pageTest, ""], [/\/index$/, "/"]],
	html: function() {
		let string = arguments[0][0];
		const substitutions = Array.prototype.slice.call(arguments, 1);
		for(let i = 0; i < substitutions.length; i++) {
			let code = String(substitutions[i]);
			for(const v of ServeCube.htmlReplacements) {
				code = code.replace(v[0], v[1]);
			}
			string += code + arguments[0][i+1];
		}
		return string;
	},
	serve: async o => {
		const cube = {};
		const options = cube.options = o instanceof Object ? o : {};
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
		if(typeof options.githubToken !== "string") {
			options.githubToken = false;
		}
		const app = cube.app = express();
		app.set("trust proxy", true);
		const tree = cube.tree = {};
		const treeDirs = [];
		const plant = async (parent, path) => {
			const children = await fs.readdir(options.basePath + path);
			for(const v of children) {
				parent.children[v] = {};
				const child = `${path}/${v}`;
				const childPath = options.basePath + child;
				const isDir = (await fs.stat(childPath)).isDirectory();
				if(v.startsWith("index.") && !isDir && pageTest.test(v)) {
					parent.index = v;
				} else {
					const params = [];
					const re = pathToRegexp(v.replace(pageTest, "").replace(templateTest, ":$1"), params, pathToRegexpOptions);
					if(params.length) {
						parent.children[v].params = params.map(w => w.name);
						parent.children[v].test = re;
					}
				}
				if(isDir) {
					parent.children[v].children = {};
					await plant(parent.children[v], child);
				} else if(v.endsWith(".njs")) {
					parent.children[v].func = options.eval(`(async function() {\n${await fs.readFile(childPath)}\n})`);
				}
			}
		};
		const climb = (output, parent, path, i) => {
			let child;
			if(path[i] === "") {
				child = parent.index;
			} if(parent.children[path[i]] && !parent.children[path[i]].test) {
				child = path[i];
			} else {
				for(const j of Object.keys(parent.children)) {
					if(parent.children[j].test) {
						let matches = path[i].match(parent.children[j].test);
						if(matches) {
							for(let k = 0; k < parent.children[j].params.length; k++) {
								output.params[parent.children[j].params[k]] = matches[k+1];
							}
							child = j;
							break;
						}
					} else if(pageTest.test(j) && path[i] === j.replace(pageTest, "") && !parent.children[j].test) {
						child = j;
						break;
					}
				}
			}
			if(child) {
				let next;
				output.func = parent.children[child].func;
				return child + (parent.children[child].children && (next = climb(output, parent.children[child], path, i+1)) ? `/${next}` : (parent.children[child].index ? `/${parent.children[child].index}` : ""));
			}
		};
		for(const v of [`${options.errorDir}/`, ...Object.values(options.subdomains)]) {
			if(v.endsWith("/") && !treeDirs.includes(v)) {
				const dir = v.slice(0, -1);
				treeDirs.push(dir);
				await plant(tree[dir] = {
					children: {}
				}, dir);
			}
		}
		const readCache = cube.readCache = {};
		const loadCache = cube.loadCache = {};
		const datesModified = cube.datesModified = {};
		const uncache = cube.uncache = rawPath => {
			delete readCache[rawPath];
			delete loadCache[rawPath];
		};
		const getRawPath = cube.getRawPath = async path => {
			const dir = (path = path.split("/"))[0];
			path = path.slice(1);
			const output = {};
			output.rawPath = climb(output, tree[dir], path, 0);
			if(output.rawPath && !(await fs.stat(options.basePath + (output.rawPath = `${dir}/${output.rawPath}`))).isFile()) {
				output.rawPath = undefined;
			}
			return output;
		};
		const load = cube.load = async (path, context) => {
			const {rawPath, params, func} = await getRawPath(path);
			if(!rawPath) {
				throw new ServeCubeError(`File \`${path}\` was not found, under \`${rawPath}\`.`);
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
				return loadCache[context.rawPath] && loadCache[context.rawPath][cacheIndex = `:${loadCache[context.rawPath].discriminate instanceof Function ? loadCache[cacheIndex].discriminate(context) : ""}`] ? {
					...context,
					...loadCache[context.rawPath][cacheIndex]
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
						if(context.cache) {
							delete returnedContext.cache;
							if(!loadCache[context.rawPath]) {
								loadCache[context.rawPath] = {
									discriminate: context.cache instanceof Function ? context.cache : true
								};
							}
							loadCache[context.rawPath][`:${context.cache instanceof Function ? context.cache(context) : ""}`] = returnedContext;
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
		const renderLoad = cube.renderLoad = async (path, req, res) => {
			res.set("Content-Type", "text/html");
			const result = await load(path, {
				req,
				res
			});
			if(result.redirect) {
				if(result.status) {
					res.redirect(result.status, result.redirect);
				} else {
					res.redirect(result.redirect);
				}
			} else {
				if(result.headers) {
					for(const i of Object.keys(result.headers)) {
						if(result.headers[i]) {
							res.set(i, result.headers[i]);
						}
					}
				}
				if(result.status) {
					res.status(result.status);
				}
				res.send(result.value);
			}
		};
		const renderError = cube.renderError = async (status, req, res) => {
			const path = `${options.errorDir}/${status}`;
			const {rawPath} = await getRawPath(path);
			if(rawPath) {
				renderLoad(path, req, res);
			} else {
				res.status(status).send(String(status));
			}
		};
		app.use(async (req, res) => {
			res.set("X-Magic", "real");
			res.set("Access-Control-Expose-Headers", "X-Magic");
			res.set("X-Frame-Options", "SAMEORIGIN");
			req.subdomain = req.subdomains.join(".");
			let redirect = false;
			const subdomain = options.subdomains[req.subdomain] === undefined ? options.subdomains["*"] : options.subdomains[req.subdomain];
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
			let url = req.url;
			for(const v of ServeCube.urlReplacements) {
				url = url.replace(v[0], v[1]);
			}
			if(req.url !== url) {
				if(redirect === false) {
					redirect = `${req.protocol}://${(subdomain === "." ? "" : subdomain) + options.domain + url}`;
				} else {
					redirect += options.domain + url;
				}
			} else if(redirect !== false) {
				redirect += options.domain + req.url;
			}
			if(redirect !== false) {
				res.redirect(redirect);
			} else {
				try {
					req.decodedURL = decodeURIComponent(req.url);
				} catch(err) {
					renderError(400, req, res);
					return;
				}
				const queryIndex = (req.queryIndex = req.decodedURL.indexOf("?"))+1;
				req.queryString = queryIndex ? req.decodedURL.slice(queryIndex, req.decodedURL.length) : undefined;
				Object.assign(req, await getRawPath(req.dir + (req.decodedPath = req.decodedURL.slice(0, !queryIndex ? undefined : req.queryIndex))));
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
			if(req.method === "GET") {
				res.set("Cache-Control", "max-age=86400");
			}
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
								const headers = {
									"User-Agent": "ServeCube"
								};
								if(options.githubToken) {
									headers.Authorization = `token ${options.githubToken}`;
								}
								const file = JSON.parse(await request.get({
									url: `https://api.github.com/repos/${payload.repository.full_name}/contents/${i}?ref=${branch}`,
									headers: headers
								}));
								let contents = Buffer.from(file.content, file.encoding);
								let index = 0;
								while(index = i.indexOf("/", index)+1) {
									const nextPath = options.basePath + i.slice(0, index-1);
									if(!await fs.exists(nextPath)) {
										await fs.mkdir(nextPath);
									}
								}
								// TODO: Don't minify content in `textarea` and `pre` tags.
								if(i.endsWith(".njs")) {
									contents = String(contents).split(htmlTest);
									for(let j = 1; j < contents.length; j += 2) {
										contents[j] = contents[j].replace(brs, "").replace(whitespace, " ");
									}
									contents = contents.join("");
								} else if(i.endsWith(".html") || i.endsWith(".htm")) {
									contents = contents.replace(brs, "").replace(whitespace, " ");
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
							}
							uncache(i);
						}
						res.send();
						if(files["package.json"] || files[process.mainModule.filename.slice(process.cwd().length+1)] === 0) {
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
				const type = mime.getType(req.decodedPath) || mime.getType(req.rawPath);
				res.set("Content-Type", type);
				if(req.rawPath.endsWith(".njs")) {
					renderLoad(req.dir + req.decodedPath, req, res);
				} else {
					if(type === "application/javascript" || type === "text/css") {
						res.set("SourceMap", `${req.decodedPath.slice(req.decodedPath.lastIndexOf("/")+1)}.map`);
					}
					fs.createReadStream(options.basePath + req.rawPath).pipe(res);
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
