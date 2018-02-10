const os = require("os");
const fs = require("fs");
const http = require("http");
const https = require("https");
const request = require("request-promise-native");
const express = require("express");
const session = require("express-session");
//const RedisStore = require("connect-redis")(session);
const cookieParser = require("cookie-parser");
const bodyParser = require("body-parser");
const childProcess = require("child_process");
const crypto = require("crypto");
const babel = require("babel-core");
const UglifyJS = require("uglify-js");
const CleanCSS = require("clean-css");
const mime = require("mime");
mime.define({
	"text/html": ["njs"]
});
const ServeCube = {
	html: function() {
		let string = arguments[0][0];
		const substitutions = Array.prototype.slice.call(arguments, 1);
		for(let i = 0; i < substitutions.length; i++) {
			string += String(substitutions[i]).replace(/"/g, "&quot;").replace(/'/g, "&#39;").replace(/</g, "&lt;").replace(/>/g, "&gt;") + arguments[0][i+1];
		}
		return string;
	},
	serve: o => {
		const cube = {};
		if(!(o instanceof Object)) {
			o = {};
		}
		const options = cube.options = {...o};
		if(!(options.eval instanceof Function)) {
			options.eval = eval;
		}
		if(typeof options.hostname !== "string") {
			options.hostname = os.hostname();
		}
		if(typeof options.basePath !== "string") {
			options.basePath = `${process.cwd()}/`;
		}
		options.basePath = options.basePath.replace(/\\/g, "/");
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
		if(!(options.subdomain instanceof Array)) {
			if(typeof options.subdomain === "string") {
				options.subdomain = [options.subdomain];
			} else {
				options.subdomain = [""];
			}
		}
		if(typeof options.githubSecret !== "string") {
			options.githubSecret = "";
		}
		options.uncacheModified = !!options.uncacheModified;
		const app = cube.app = express();
		app.set("trust proxy", true);
		app.use(cookieParser());
		app.use(bodyParser.raw({
			limit: "100mb",
			type: "*/*"
		}));
		/* TODO
		app.use(session({
			name: "session",
			secret: options.sessionSecret,
			resave: false,
			saveUninitialized: false,
			cookie: {
				secure: true,
				maxAge: 604800000
			},
			store: new RedisStore({
				
			})
		}));
		*/
		const rawPathCache = cube.rawPathCache = {};
		const readCache = cube.readCache = {};
		const loadCache = cube.loadCache = {};
		const datesModified = cube.datesModified = {};
		const uncache = cube.uncache = cacheIndex => {
			Object.keys(rawPathCache).forEach(i => {
				if(rawPathCache[i] === cacheIndex) {
					delete rawPathCache[i];
				}
			});
			if(readCache[cacheIndex]) {
				delete readCache[cacheIndex];
			}
			if(loadCache[cacheIndex]) {
				if(loadCache[cacheIndex] === 2) {
					Object.keys(loadCache).forEach(i => {
						if(i.slice(i.indexOf(" ")+1).startsWith(`${cacheIndex}?`)) {
							delete loadCache[i];
						}
					});
				}
				delete loadCache[cacheIndex];
			}
		};
		const getRawPath = cube.getRawPath = (path, publicDirectory) => {
			if(rawPathCache[path]) {
				return rawPathCache[path];
			} else {
				let output = path;
				if(!output.startsWith("/")) {
					output = `/${output}`;
				}
				output = `${options.basePath}${publicDirectory || "www"}${output.replace(/[\\\/]+/g, "/").replace(/\/\.{1,2}\//g, "")}`;
				if(output.lastIndexOf("/") > output.lastIndexOf(".")) {
					let addend = "";
					if(fs.existsSync(output) && fs.statSync(output).isDirectory()) {
						if(!output.endsWith("/")) {
							output += "/";
						}
						addend = "index";
					}
					let newOutput;
					if((fs.existsSync(newOutput = `${output}${addend}.njs`) && !fs.statSync(newOutput).isDirectory()) || (fs.existsSync(newOutput = `${output}${addend}.html`) && !fs.statSync(newOutput).isDirectory()) || (fs.existsSync(newOutput = `${output}${addend}.htm`) && !fs.statSync(newOutput).isDirectory())) {
						output = newOutput;
					}
				}
				const keys = Object.keys(rawPathCache);
				if(keys.length > 100) {
					delete rawPathCache[keys[0]];
				}
				return rawPathCache[path] = output;
			}
		};
		const load = cube.load = (path, context, publicDirectory) => {
			const rawPath = getRawPath(path, publicDirectory);
			if(options.uncacheModified) {
				const {mtimeMs} = fs.statSync(rawPath);
				if(datesModified[rawPath] !== undefined && mtimeMs > datesModified[rawPath]) {
					uncache(rawPath);
				}
				datesModified[rawPath] = mtimeMs;
			}
			if(context) {
				context = {...context};
				delete context.cache;
				delete context.value;
				delete context.exit;
			} else {
				context = {};
			}
			const properties = ["exit", "req", "res", Object.keys(context)];
			context.value = "";
			return new Promise((resolve, reject) => {
				let cacheIndex = `${context.req.method} ${rawPath}`;
				if(loadCache[cacheIndex] === 2) {
					cacheIndex += "?";
					const queryIndex = context.req.url.indexOf("?");
					if(queryIndex !== -1) {
						cacheIndex += context.req.url.slice(queryIndex+1);
					}
				}
				if(loadCache[cacheIndex]) {
					resolve({
						...context,
						...loadCache[cacheIndex]
					});
				} else {
					context.exit = () => {
						if(context.cache) {
							if(context.cache === 2) {
								loadCache[rawPath] = context.cache;
								cacheIndex += "?";
								const queryIndex = context.req.url.indexOf("?");
								if(queryIndex !== -1) {
									cacheIndex += context.req.url.slice(queryIndex+1);
								}
							}
							loadCache[cacheIndex] = {};
							Object.keys(context).forEach(i => {
								if(!properties.includes(i)) {
									loadCache[cacheIndex][i] = context[i];
								}
							});
						}
						resolve(context);
					};
					try {
						if(!readCache[rawPath]) {
							readCache[rawPath] = options.eval(`(async function() {\n${fs.readFileSync(rawPath)}\n})`);
						}
						readCache[rawPath].call(context);
					} catch(err) {
						reject(err);
					}
				}
			});
		};
		const renderLoad = cube.renderLoad = async (path, req, res, publicDirectory) => {
			res.set("Content-Type", "text/html");
			const result = await load(path, {
				req,
				res
			}, publicDirectory);
			if(result.redirect) {
				if(result.status) {
					res.redirect(result.status, result.redirect);
				} else {
					res.redirect(result.redirect);
				}
			} else {
				if(result.headers) {
					Object.keys(result.headers).forEach(i => {
						if(result.headers[i]) {
							res.set(i, result.headers[i]);
						}
					});
				}
				if(result.status) {
					res.status(result.status);
				}
				res.send(result.value);
			}
		};
		const renderError = cube.renderError = (status, req, res) => {
			if(fs.existsSync(`error/${status}.njs`) || fs.existsSync(`error/${status}.html`) || fs.existsSync(`error/${status}.htm`)) {
				renderLoad(`/${status}`, req, res, "error");
			} else {
				res.status(status).send(String(status));
			}
		};
		app.use((req, res) => {
			res.set("X-Magic", "real");
			res.set("Access-Control-Expose-Headers", "X-Magic");
			res.set("Access-Control-Allow-Origin", "*");
			const host = req.get("Host") || (req.subdomain ? `${req.subdomain}.` : "") + options.hostname;
			if(host.startsWith("localhost:")) {
				Object.defineProperty(req, "protocol", {
					value: "https",
					enumerable: true
				});
			}
			if(req.protocol === "http") {
				res.redirect(`https://${host + req.url}`);
			} else {
				req.subdomain = req.subdomains.join(".");
				if(req.subdomain === "www") {
					res.redirect(`${req.protocol}://${host.slice(4) + req.url}`);
				} else {
					try {
						req.decodedPath = decodeURIComponent(req.url);
						req.next();
					} catch(err) {
						renderError(400, req, res);
					}
				}
			}
		});
		app.all("*", async (req, res) => {
			if(!options.subdomain.includes(req.subdomain)) {
				return;
			}
			const getMethod = req.method === "GET";
			if(getMethod) {
				res.set("Cache-Control", "max-age=86400");
			} else if(req.method !== "POST") {
				return;
			}
			const queryIndex = req.decodedPath.indexOf("?");
			const noQueryIndex = queryIndex === -1;
			const path = getRawPath(noQueryIndex ? req.decodedPath : req.decodedPath.slice(0, queryIndex));
			const type = path.lastIndexOf("/") > path.lastIndexOf(".") ? "text/plain" : mime.getType(path);
			let publicPath = path.slice(options.basePath.length+3);
			if(publicPath.endsWith(".njs") || publicPath.endsWith(".htm")) {
				publicPath = publicPath.slice(0, -4);
			} else if(publicPath.endsWith(".html")) {
				publicPath = publicPath.slice(0, -5);
			}
			if(publicPath.endsWith("/index")) {
				publicPath = publicPath.slice(0, -5);
			}
			let publicPathQuery = publicPath;
			if(!noQueryIndex) {
				publicPathQuery += req.decodedPath.slice(queryIndex);
			}
			if(req.decodedPath !== publicPathQuery) {
				res.redirect(publicPathQuery);
			} else if(options.githubSecret && publicPath === options.githubPayloadURL) {
				const signature = req.get("X-Hub-Signature");
				if(signature && signature === `sha1=${crypto.createHmac("sha1", options.githubSecret).update(req.body).digest("hex")}` && req.get("X-GitHub-Event") === "push") {
					const payload = JSON.parse(req.body);
					const branch = payload.ref.slice(payload.ref.lastIndexOf("/")+1);
					if(branch === "master") {
						const files = {};
						for(let i of payload.commits) {
							for(let j of i.removed) {
								files[j] = 1;
							}
							for(let j of i.modified) {
								files[j] = 2;
							}
							for(let j of i.added) {
								files[j] = 3;
							}
						}
						Object.keys(files).forEach(async i => {
							if(files[i] === 1) {
								if(fs.existsSync(i)) {
									fs.unlinkSync(i);
									const type = mime.getType(i);
									if(type === "application/javascript" || type === "text/css") {
										fs.unlinkSync(`${i}.map`);
									}
								}
								let index = i.length;
								while((index = i.lastIndexOf("/", index)-1) !== -2) {
									const path = i.slice(0, index+1);
									if(fs.existsSync(path)) {
										try {
											fs.rmdirSync(path);
										} catch(err) {
											break;
										}
									}
								}
							} else if(files[i] === 2 || files[i] === 3) {
								const file = JSON.parse(await request.get({
									url: `https://api.github.com/repos/${payload.repository.full_name}/contents/${i}?ref=${branch}`,
									headers: {
										"User-Agent": "ServeCube"
									}
								}));
								let contents = Buffer.from(file.content, file.encoding);
								let index = 0;
								while(index = i.indexOf("/", index)+1) {
									nextPath = i.slice(0, index-1);
									if(!fs.existsSync(nextPath)) {
										fs.mkdirSync(nextPath);
									}
								}
								// TODO: Don't minify content in `textarea` and `pre` tags.
								if(i.endsWith(".njs")) {
									contents = String(contents).split(/(html`(?:(?:\${(?:`(?:.*|\n)`|"(?:.*|\n)"|'(?:.*|\n)'|.|\n)*?})|.|\n)*?`)/g);
									for(let j = 1; j < contents.length; j += 2) {
										contents[j] = contents[j].replace(/\n/g, "").replace(/\s+/g, " ");
									}
									contents = contents.join("");
								} else if(i.endsWith(".html") || i.endsWith(".htm")) {
									contents = contents.replace(/\n/g, "").replace(/\s+/g, " ");
								} else if(i.startsWith("www/")) {
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
										fs.writeFileSync(`${i}.map`, result.map);
									} else if(type === "text/css") {
										const output = new CleanCSS({
											inline: false,
											sourceMap: true
										}).minify(String(contents));
										contents = output.styles;
										const sourceMap = JSON.parse(output.sourceMap);
										sourceMap.sources = [i.slice(i.lastIndexOf("/")+1)];
										fs.writeFileSync(`${i}.map`, JSON.stringify(sourceMap));
									}
								}
								fs.writeFileSync(i, contents);
							}
							uncache(`${options.basePath}${i}`);
							files[i] = 0;
							let sum = 0;
							Object.keys(files).forEach(j => sum += files[j]);
							if(!sum) {
								const packageUpdate = files["package.json"] === 0;
								if(packageUpdate || files[process.mainModule.filename.slice(process.cwd().length+1)] === 0) {
									if(packageUpdate) {
										childProcess.spawnSync("npm", ["update"]);
									}
									process.exit();
								}
							}
						});
						res.send();
					} else {
						res.send();
					}
				} else {
					renderError(503, req, res);
				}
			} else if(fs.existsSync(path)) {
				res.set("Content-Type", type);
				if(path.endsWith(".njs")) {
					renderLoad(publicPath, req, res);
				} else {
					if(type === "application/javascript" || type === "text/css") {
						res.set("SourceMap", `${publicPath.slice(publicPath.lastIndexOf("/")+1)}.map`);
					}
					fs.createReadStream(path).pipe(res);
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
