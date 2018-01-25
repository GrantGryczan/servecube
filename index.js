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
		const val = {};
		if(!o) {
			o = {};
		}
		const options = {...o};
		if(!(typeof options.eval === "function")) {
			options.eval = eval;
		}
		if(!(typeof options.basePath === "string")) {
			options.basePath = `${process.cwd()}/`;
		}
		options.basePath = options.basePath.replace(/\\/g, "/");
		if(!(typeof options.serverPath === "string")) {
			options.serverPath = "server.js";
		}
		if(!(typeof options.httpPort === "number")) {
			options.httpPort = 8080;
		}
		if(options.tls instanceof Object) {
			if(!(typeof options.httpsPort === "number")) {
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
		if(options.errorRedirect instanceof Object) {
			Object.keys(options.errorRedirect).forEach(i => {
				if(!(typeof options.errorRedirect[i] === "string")) {
					delete options.errorRedirect[i];
				}
			});
		} else {
			options.errorRedirect = {};
		}
		if(!(typeof options.githubSecret === "string")) {
			options.githubSecret = "";
		}
		const app = val.app = express();
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
		app.use((req, res) => {
			res.set("X-Magic", "real");
			res.set("Access-Control-Expose-Headers", "X-Magic");
			res.set("Access-Control-Allow-Origin", "*");
			const host = req.get("Host");
			if(host) {
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
							res.status(400).send("400");
						}
					}
				}
			} else {
				res.status(400).send("You need a new web browser.");
			}
		});
		const rawPathCache = val.rawPathCache = {};
		const getRawPath = val.getRawPath = path => {
			if(rawPathCache[path]) {
				return rawPathCache[path];
			} else {
				let output = path;
				if(!output.startsWith("/")) {
					output = `/${output}`;
				}
				output = `${options.basePath}www${output.replace(/[\\\/]+/g, "/").replace(/\/\.{1,2}\//g, "")}`;
				if(output.lastIndexOf("/") > output.lastIndexOf(".")) {
					if(fs.existsSync(output) && fs.statSync(output).isDirectory()) {
						if(!output.endsWith("/")) {
							output += "/";
						}
						output += "index.njs";
					} else {
						const outputFile = `${output}.njs`;
						if(fs.existsSync(outputFile) && !fs.statSync(outputFile).isDirectory()) {
							output = outputFile;
						}
					}
				}
				const keys = Object.keys(rawPathCache);
				if(keys.length > 100) {
					delete rawPathCache[keys[0]];
				}
				return rawPathCache[path] = output;
			}
		};
		const readCache = val.readCache = {};
		const loadCache = val.loadCache = {};
		const load = val.load = (path, context) => {
			const rawPath = getRawPath(path);
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
						const modified = fs.statSync(rawPath).mtimeMs;
						if(!readCache[rawPath]) {
							readCache[rawPath] = [modified, options.eval(`(async function() {\n${fs.readFileSync(rawPath)}\n})`)];
						}
						readCache[rawPath][1].call(context);
					} catch(err) {
						reject(err);
					}
				}
			});
		};
		app.all("*", async (req, res) => {
			const getMethod = req.method === "GET";
			if(getMethod) {
				res.set("Cache-Control", "max-age=86400");
			} else if(req.method !== "POST" || !options.subdomain.includes(req.subdomain)) {
				return;
			}
			const queryIndex = req.decodedPath.indexOf("?");
			const noQueryIndex = queryIndex === -1;
			const path = getRawPath(noQueryIndex ? req.decodedPath : req.decodedPath.slice(0, queryIndex));
			const type = (path.lastIndexOf("/") > path.lastIndexOf(".")) ? "text/plain" : mime.getType(path);
			let publicPath = path.slice(options.basePath.length+3);
			if(publicPath.endsWith(".njs")) {
				publicPath = publicPath.slice(0, -4);
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
								files[j] = -1;
							}
							for(let j of i.modified) {
								files[j] = 0;
							}
							for(let j of i.added) {
								files[j] = 1;
							}
						}
						Object.keys(files).forEach(async i => {
							if(files[i] == -1) {
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
										} catch(err) {}
									}
								}
							} else if(files[i] === 0 || files[i] === 1) {
								let contents = String(new Buffer(JSON.parse(await request.get({
									url: `https://api.github.com/repos/${payload.repository.full_name}/contents/${i}?ref=${branch}`,
									headers: {
										"User-Agent": "request"
									}
								})).content, "base64"));
								let index = 0;
								while(index = i.indexOf("/", index)+1) {
									nextPath = i.slice(0, index-1);
									if(!fs.existsSync(nextPath)) {
										fs.mkdirSync(nextPath);
									}
								}
								if(i.startsWith("www/")) {
									if(i.endsWith(".njs")) {
										contents = contents.split(/(html`(?:(?:\${(?:`(?:.*|\n)`|"(?:.*|\n)"|'(?:.*|\n)'|.|\n)*?})|.|\n)*?`)/g);
										for(let j = 1; j < contents.length; j += 2) {
											contents[j] = contents[j].replace(/\n/g, "").replace(/\s+/g, " ");
										}
										contents = contents.join("");
									} else {
										const type = mime.getType(i);
										if(type === "application/javascript") {
											const filename = i.slice(i.lastIndexOf("/")+1);
											const compiled = babel.transform(contents, {
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
													passes: 2,
													unsafe_math: true
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
											}).minify(contents);
											contents = output.styles;
											const sourceMap = JSON.parse(output.sourceMap);
											sourceMap.sources = [i.slice(i.lastIndexOf("/")+1)];
											fs.writeFileSync(`${i}.map`, JSON.stringify(sourceMap));
										}
									}
								}
								fs.writeFileSync(i, contents);
							}
							if(readCache[i]) {
								delete readCache[i];
							}
							if(loadCache[i]) {
								if(loadCache[i] === 2) {
									Object.keys(loadCache).forEach(j => {
										if(j.slice(j.indexOf(" ")+1).startsWith(`${i}?`)) {
											delete loadCache[i];
										}
									});
								}
								delete loadCache[i];
							}
						});
						for(let v of payload.commits) {
							for(let i of v.removed) {
								if(!removed.includes(i)) {
									removed.push(i);
								}
							}
						}
						res.send();
						if(files["package.json"]) {
							childProcess.spawnSync("npm", ["update"]);
						}
						if(files[process.mainModule.filename.slice(process.cwd().length+1)]) {
							process.exit();
						}
					} else {
						res.send();
					}
				} else {
					res.status(403).send();
				}
			} else if(fs.existsSync(path)) {
				res.set("Content-Type", type);
				if(path.endsWith(".njs")) {
					res.set("Cache-Control", "no-cache");
					res.set("Content-Type", "text/html");
					const result = await load(publicPath, {
						req,
						res
					});
					if(result.headers) {
						Object.keys(result.headers).forEach(i => res.set(i, result.headers[i]));
					}
					if(result.status) {
						res.status(result.status);
					}
					res.send(result.value);
				} else {
					if(type === "application/javascript" || type === "text/css") {
						res.set("SourceMap", `${publicPath.slice(publicPath.lastIndexOf("/")+1)}.map`);
					}
					fs.createReadStream(path).pipe(res);
				}
			} else {
				if(getMethod && type === "text/html" && options.errorRedirect[404]) {
					res.redirect(options.errorRedirect[404]);
				} else {
					res.status(404).send("404");
				}
			}
		});
		http.createServer(app).listen(options.httpPort);
		if(options.tls) {
			https.createServer(options.tls, app).listen(options.httpsPort);
		}
		return val;
	}
};
module.exports = ServeCube;
