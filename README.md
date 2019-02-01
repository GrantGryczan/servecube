# ServeCube
ServeCube is a modular Node web framework optimized for websites and web services for your development convenience.
```bash
npm install servecube --save
```
**Node 8.6.0+** is required.

This documentation assumes you already have a fair understanding of JavaScript, Node, and how the web works.

## Features
* This framework wraps [`express`](https://github.com/expressjs/express) and has many of its features built in and accessible.
* You can optionally connect your server to a GitHub webhook so that source code is automatically uploaded to the server.
* With GitHub connection comes automatic minification for HTML, JS, and CSS, automatic transpilation with Sass SCSS and Babel JS, and automatic source mapping.
* The framework is very modular so that each page or endpoint (and HTTP method, optionally) can be its own file.
* Any file type can be served to the client, and the Node JS file type (NJS) is used for server-side JavaScript evaluation.
* With JavaScript evaluation comes document templating (and everything else you can do with JavaScript, duh).
* Escaping HTML is super easy and super efficient.
* URL parameter templating is available.
* Multiple subdomains with different functions in one server are accepted.

## Version Format
If any updates that might affect your current ServeCube implementation are applied, the second digit in the version number is raised. Thus, if you are to update the ServeCube module in your package, you should check the docs for relevant updates if it is the second digit that increased. If the third digit increases, it is only a bug fix or small update that will not typically deem your code dysfunctional.

## Terminology
* The ServeCube **tree** is a cache of much of your working directory's file structure. This tree does not persist between Node processes.
* A **planted** file is a file cached under the tree. These files have potential to be served to users visiting your website.
* To **limb** a file is to remove it from the tree and clear all cached instances of it by ServeCube.
* To **replant** a file is to load a file to the tree again.
* A **page file** is an NJS or HTML file.

## File Structure
Under your working directory, it is ideal that you have at least these two directories created: `www` and `error`. (These can be renamed, and more can be used for multiple subdomains through `options.subdomains`. [Here is documentation on the `options` object.](#async-serveoptions)) These are your public directories. Public directories and their contents are planted.

**HTML files** can end with ".html" or ".htm", case-insensitive.

**NJS files** can end with ".njs", case-insensitive. They are your Node JS files, analogous to PHP files, where JavaScript code is evaluated on the server before it is served to the client. These files can have double extensions (like "file.png.njs") for ServeCube to set the content type to that of the specified extension. By default the content type is HTML. [Here is more information on how to use this file type.](#njs-files)

Only the contents of NJS files are cached under the planted file's metadata by ServeCube, so that JavaScript evaluation is faster. All other file types, including HTML, are piped directly from the file system to the response when requested.

For every planted directory, the following information is true.
* They can contain one index file, which is served when a user requests the directory's path as a directory (_with_ an ending slash).
	* Index files are named "index", case-insensitive.
	* They must be page files.
* They can contain method files, which are served when a user requests the directory's path as a file (_without_ an ending slash).
	* Method files are named by the HTTP method (like "GET"), and must be fully capitalized.
	* They must be page files.
	* One method file can handle multiple methods by separating method names with commas (and an optional space after each comma), like "PUT,PATCH" or "PUT, PATCH".
	* Only the `GET`, `POST`, `PUT`, `DELETE`, and `PATCH` methods can be handled by method files.
	* All methods can be handled at once by simply naming the file "ALL". This file is only requested if there are no other valid method files available in its directory.
	* If ServeCube receives an `OPTIONS` request, it should appropriately respond in every case.
	* Only `GET` requests are accepted by non-NJS files.
	* The `HEAD` method is not currently supported, and there is no intention to support the `CONNECT` and `TRACE` methods.
* They can contain regular page files, which are served when a user requests the file's path (favorably without a page extension like ".html").
* They can contain directories, to which these statements also apply.
* They can contain other files that do not fall under the above specifications, such as `image.png` or `script.js`. These will be treated as one would expect and are served when a user `GET`s the file's path.

All directories and files can use URL parameter templating in the filename. To define a URL parameter, simple place a parameter name in curly brackets into the filename. When the user enters a URL with values in place of URL parameters, those values are accessible in an object from inside the NJS file. A reference can be found [here](#njs-files), under the `params` property of context objects.

The error directory is requested automatically when there is an error. It will always request `error/STATUS`, "STATUS" replaced with the number of the HTTP error code. For example, if a user requests a file that is not planted, ServeCube will request `error/404`. This might retrieve a file called, for example, "404.html", "404.njs", "404.htm", "{status}.njs", or "4{xx}.njs". If no suited file exists, it will simply return HTTP error code 404 with a plain text body containing "404".

Assuming the default subdomain options are used, here are several examples of requested URL paths and what planted file will be retrieved and loaded in response.
* `GET /` -> `www/index.njs`
* `POST /` -> `www/index.njs`
* `GET /dir/` -> `www/dir/index.njs`
* `GET /dir` -> `GET /dir/` -> `www/dir/index.njs`
* `GET /test` -> `www/test/GET.html`
* `PATCH /test` -> `www/test/PUT,PATCH.html`
* `GET /files/example` -> `www/files/example.html`
* `GET /files/example.html` -> `GET /files/example` -> `www/files/example.html`
* `GET /images/random.png` -> `www/images/random.png.njs`
* `GET /whatever` -> `www/whatever/ALL.html`
* `GET /whatever/` -> `www/whatever/index.html`
* `GET /whatever/file.txt` -> `www/whatever/file.txt`
* `POST /users/CoolGuy43/messages` -> `www/users/{username}/messages/POST.json.njs`
* `GET /users/CoolGuy43/messages/123/contents` -> `www/users/{username}/messages/{message}/contents/GET.json.njs`
* `PUT /users/CoolGuy43` -> `www/users/{username}/PUT.json.njs`
* `DELETE /all/this/nonsense` -> `www/all/this/nonsense.njs`
* `DELETE /all/this/trash` -> `www/all/this/{other}.njs`
* `GET /page_which_does_not_exist` -> `error/404` -> `error/{status}.njs`

## Usage
This code should be used to load the ServeCube module.
```js
const {serve, html} = require("servecube");
```

### async serve(options)
(Function) Initiate your cube web server.
* `options`: (Object) The cube's options.
	* `eval(string)`: (Function) This should almost always be set to `v => eval(v)` so ServeCube is able to evaluate your NJS files under the correct scope.
		* Optional but recommended
		* Default: `eval`
		* Example: `v => eval(v)`
	* `domain`: (string) Your website's domain (without any subdomain, and with the port if necessary for URL access).
		* Required
		* Examples: `"example.com"`, `"localhost:8080"`, `"miroware.io"`
	* `basePath`: (string) An absolute path to your current working directory, which should contain your `package.json` file. This value is prepended to every relative path you use. This directory's file structure is cached by ServeCube. If you connect GitHub to ServeCube, the repository's base directory is synced to this one.
		* Optional
		* Default: `process.cwd()`
		* Examples: `"/home/web/"`, `"/var/www/"`
	* `errorDir`: (string) A relative path to your error directory.
		* Optional
		* Examples: `"error"`, `"err"`
	* `loadDirs`: (Array) Any relative paths to be planted in addition to those provided in the subdomain and error directories.
		* Optional
		* Example: `["load"]`
	* `httpPort`: (number) The port number listened to for HTTP traffic.
		* Optional
		* Default: `8080`
		* Examples: `80`, `3000`, `8888`, `8000`, `8081`
	* `tls`: (Object) Options for `https.createServer`. A reference can be found [here](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener). Setting this property enables HTTPS for your cube web server.
		* Optional
		* Example: `{key: fs.readFileSync("ssl/privkey.pem"), cert: fs.readFileSync("ssl/cert.pem"), ca: fs.readFileSync("ssl/chain.pem")}`
	* `httpsPort`: (number) The port number listened to for HTTPS traffic.
		* Optional
		* Default: `8443`
		* Examples: `443`, `3443`, `4000`, `8444`
	* `httpsRedirect`: (boolean) Whether to redirect HTTP traffic to HTTPS traffic.
		* Optional
		* Default: `true` if `options.tls` is defined, `false` if not
	* `subdomains`: (Object) Your subdomain configuration. Object keys are subdomains. Object values are strings. Values can represent redirection to another subdomain by that subdomain with a trailing period, or they can represent being associated with a particular directory by its relative path with a trailing slash.
		* Optional
		* Default: `{"": "www/", "*": "."}` No-subdomain uses the `www` directory and all subdomains redirect to no-subdomain.
		* `""`: An empty string as a key represents when there is no subdomain in the URL.
		* `"*"`: An asterisk as a key represents a wildcard subdomain: the fallback property for when no property for a requested subdomain is defined. The default object is completely ignored when this property is defined.
		* Examples:
			* `{www: "www/", "*": "www."}` The `www` subdomain uses the `www` directory and all other subdomains redirect to the `www` subdomain. The default values are ignored as a wildcard is defined.
			* `{"": "public_html/", api: "api/"}` No-subdomain uses the `public_html` directory and the `api` subdomain uses the `api` directory. Due to the default, all other subdomains redirect to no-subdomain.
			* `{m: "www/", mobile: "m."}` The `m` subdomain uses the `www` directory and the `mobile` subdomain redirects to the `m` subdomain. Due to the default, no-subdomain also uses the `www` directory and all other subdomains redirect to no-subdomain.
	* `githubSecret`: (string) Your GitHub webhook's secret. Setting this property enables GitHub integration.
		* Optional
	* `githubSubdomain`: (string) The subdomain to accept GitHub webhook requests on, or an empty string to accept on no-subdomain.
		* Optional
		* Default: `""`
		* Examples: `"api"`, `"github"`, `"www"`
	* `githubPayloadURL`: (string) Your GitHub webhook's payload URL. This is the URL GitHub sends data to when you push data to your repository. A request's decoded URL has to be equal to it for GitHub integration to be triggered.
		* Required if GitHub integration is enabled
		* Examples: `"/githubwebhook"`, `"/github"`, `"/push"`, `"/commits"`
	* `githubToken`: (string) A GitHub personal access token to increase the GitHub API rate limit from 60 to 5000 requests per hour. This is necessary if you want to be able to successfully push more than 60 files to the web server per hour while using GitHub integration.
		* Optional
	* `preMiddleware`: (Array) An array of `express` middleware functions to run before ServeCube's middleware. You should not use this property unless you need to, and instead use the `middleware` option.
		* Optional
	* `middleware`: (Array) An array of `express` middleware functions to run after ServeCube's middleware.
		* Optional
		* Example: `[require("cookie-parser")()]`
	* `loadStart`: (Array) An array of functions to run before a file is loaded. Each function is called with one parameter: the context of the load. You may read and/or alter the context object, and it will be passed into the page when your function has been evaluated (or if a promise it returns is resolved). Returning or resolving `false` will cause the page load to be forcibly completed, skipping the page in addition to all following `loadStart` functions. To detect whether a context is the first of a page, you can test whether its `depth` property is `1`. More information on ServeCube contexts can be found [here](#njs-files).
		* Optional
		* Example: ``[context => context.test = 0]``
	* `loadEnd`: (Array) An array of functions to run after `context.done` has been called by a loaded page. Each function is called with one parameter: the context of the load. You may read and/or alter the context object, and it will be passed as the resolved context when your function has been evaluated (or if a promise it returns is resolved). To detect whether a context is the first of a page, you can test whether its `depth` property is `1`. More information on ServeCube contexts can be found [here](#njs-files).
		* Optional
		* Example: ``[context => context.test !== 0 && console.log(`The \`context.test\` value was changed by \`${context.rawPath}\`!`)]``
	* `babelOptions`: (Object) Options to pass into `babel.transform`.
		* Optional
		* Default: `{}`
		* Example: `{plugins: ["iife-wrap"]}`
* Resolves: ([Cube](#cube)) A cube web server.

### Cube
(Object) A cube web server, from [`serve`](#async-serveoptions)'s resolution value.
* `app`: (Object) The `express` app. A reference can be found [here](https://expressjs.com/en/api.html#app).
* `tree`: (Object) The planted directory tree. Only use this if you know what you're doing.
* `async getRawPath(path, method)`: Get a planted file's metadata based on its public path.
	* `path`: (string) The input path. It should start with a base directory, followed by a URL-friendly resource path (which starts with a slash). This value should already be URI-decoded.
		* Required
		* Examples: `"www/"`, `"www/test/page/"`, `"error/404"`, `"api/users/CoolGuy43/profile"`, `"www/images/Nice logo.png"`
	* `method`: (string) The HTTP method to use in finding the requested path if applicable.
		* Optional
		* Default: `"GET"`
		* Examples: `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, `"PATCH"`
	* Resolves: (Object) The output file metadata.
		* `rawPath`: (?string) The relative path to the file, or `undefined` if the requested file is not planted.
			* Examples: `"www/index.html"`, `"www/test/page/index.NJS"`, `"error/404.njs"`, `"api/users/{username}/profile/GET.njs"`, `"www/images/Nice logo.png"`
		* `params`: (?Object) All of the requested path template parameters. Object keys are parameter names, and object values are what the keys were substituted with in the path string. This property is unset if there are no parameters. More information on URL templating can be found [here](#njs-files), under the `params` property of context objects.
		* `methods`: (?Array) All of the allowed HTTP methods you can request the file with through the path's method files. This property is unset if no planted method files exist for the requested path.
			* Examples: `["POST", "PUT", "PATCH"]`, `["GET"]`
		* `methodNotAllowed`: (?boolean) `true` if method files exist but there is no planted file for the requested method, unset if not.
		* `hasIndex`: (?boolean) Whether the requested directory has an index. This is unset if the planted file is not a directory.
		* `async func()`: (?Function) The function to call to execute the planted file, or `undefined` if the file is not an NJS file. Only use this if you know what you're doing.
* `limb(rawPath)`: (Function) Remove a file from the tree. This method will not delete the file on the file system.
	* `rawPath`: (string) The relative path to the file.
		* Required
		* Examples: Same as in the `rawPath` property of `cube.getRawPath`'s resolution value.
* `async replant(rawPath)`: (Function) Refresh a planted file in the tree. The file will be automatically limbed, if it is not already, before it is replanted. This method will read from the file system.
	* `rawPath`: Same as in `cube.limb`.
* `async load(path, context)`: (Function) Load and execute a planted file. More information can be found [here](#njs-files).
	* `path`: (string) Any value compatible with the `cube.getRawPath` `path` parameter.
		* Required
	* `context`: (Object) The context of the file, if it is an NJS file. This is what `this` will be set to from inside the file's execution. It is recommended that, whenever you use this method from within an NJS file, you set this property to `this` or an object that spreads `this` so that the current context is passed as well.
		* Optional
		* Default: `{}`
		* Examples: `this`, `{...this, method: "POST"}`, `{errorCode: 404}`, `{test: true, magic: "real"}`
	* Resolves: (Object) A context object after having been used in the loaded script.
* `loadCache`: (Object) All of the cached request contexts for caching the `cube.load` method. Only use this if you know what you're doing.
* `async renderLoad(path, req, res)`: (Function) Load and send a planted file through an HTTP request. Do not use this in any page code, or any case where a context has already been created. If you want to render an error page from inside an NJS file, `load` it manually.
	* `path`: (string) Any value compatible with the `cube.getRawPath` `path` parameter. This is particularly useful in middleware.
		* Required
	* `req`: (Object) An [`express` request object](https://expressjs.com/en/api.html#req).
		* Required
	* `res`: (Object) An [`express` response object](https://expressjs.com/en/api.html#res).
		* Required
* `async renderError(status, req, res)`: (Function) Load and send an error file through an HTTP request. This is particularly useful in middleware. Do not use this in any page code, or any case where a context has already been created. If you want to render an error page from inside an NJS file, `load` it manually.
	* `status`: (number) An HTTP status code, typically of an error.
		* Required
	* `req`: (Object) An [`express` request object](https://expressjs.com/en/api.html#req).
		* Required
	* `res`: (Object) An [`express` response object](https://expressjs.com/en/api.html#res).
		* Required

### html\`code\`
(Function) A tag function for HTML-based template literals. It is highly recommended that, whenever you are writing HTML inside of an NJS file, you always use this function.
* `code`: (template literal) A string of HTML. It does not have to be proper or complete. You can also add a second dollar sign before any expression, like `` `$${whatever}` ``, to sanitize it, which escapes the `&`, `<`, `>`, `"`, `'`, and `` ` `` characters in the expression into HTML entities. If you want to put an actual dollar sign character before an expression, just move the character into the expression, like `` `${"$" + whatever}` ``, `` `${`$${whatever}`}` ``, or whatever your personal preference is. Dollar signs are not special here if they're inside expressions, or if they aren't directly before an expression. Also, keep in mind that, if you are using GitHub integration, any tagged HTML code in your JS and NJS files will be automatically minified by ServeCube (though this `html` function is not defined by default in regular JS files).
* Returns: (string) The formatted HTML code.
* Examples:
```js
this.value += html`
	<div>
		You have <b>${cakes}</b> cakes and <b>${pies}</b> pies remaining.<br>
		Here, have some numbers: <span>`;
for (let i = 1; i <= 10; i++) {
	this.value += html` ${i}`;
}
this.value += html`</span>
	</div><br>` + (firstVisit ? html`
	Welcome to my garbage website, $${this.req.session.username}!<br>
	If you used special HTML characters in your username, it will display here exactly
		as you set it, escaped entities and all, thanks to the double dollar signs.<br>
	The same applies to whatever you set as the link to
		<a href="$${this.req.session.site}">your website</a>.<br>` : "") + html`
	<br>
	$${this.req.session.username}'s cool HTML-free profile description:<br>
	<div id="desc">$${coolDesc}</div>`;
const randomAmountOfMoney = Math.ceil(Math.random() * 100);
this.value += html`
				Oh, and here is some random amount of money: ${`$${randomAmountOfMoney}`}.<br>
				Feel free to mess with that amount here, just for fun.<br>
				$<input type="number" value="${randomAmountOfMoney}" min="0">`;
```

### html.escape(code)
(Function) A method which can be used to escape HTML. Always try to instead use the `html` tag function above whenever practical.
* `code`: (string) A string of HTML. It does not have to be proper or complete.
* Returns: (string) The escaped HTML code.

## Middleware
ServeCube wraps `express`, and uses custom middleware that does a few convenient things.

(You can counteract any of these things by adding your own middleware using the `middleware` option on [`serve`](#async-serveoptions).)

* It sets the [`X-Frame-Options` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/X-Frame-Options) to `"SAMEORIGIN"`, to block `iframe`s of your website from being loaded on other websites, preventing most clickjacking.
* It sets the [`Vary` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Vary) to "`Origin`", so that CORS headers are not cached by the client across different websites.
* It sets the [`Access-Control-Allow-Origin` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Origin) to your website's origin, so that browser requests to your web server may only be made from your own website (regardless of subdomain).
* It sets the [`Access-Control-Request-Headers` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Request-Headers) to allow all headers from browser requests.
* It sets the [`Access-Control-Allow-Credentials` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Credentials) to "`true`" so your website is able to save cookies through browser requests.
* It redirects to HTTPS if the option is available and not disabled.
* It redirects to the correct subdomain if applicable.
* It removes duplicate slashes from the URL if there are any.
* It removes the page file extension from the URL (like ".njs" or ".html") if the requested file is a page file and its extension is present.
* It removes the filename from the URL if it is an index file.
* It adds an ending slash to the URL, depending on whether the request is of an index file, if a slash is not already there.
* It sets the [`Allow` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Allow) and the [`Access-Control-Allow-Methods` header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Access-Control-Allow-Methods) correctly.
* It also sets all of these properties on the `express` request object. (A reference of the `express`-defined properties can be found [here](https://expressjs.com/en/api.html#req).)
	* `body`: (?Buffer) The request body, parsed by [`bodyParser.raw`](https://github.com/expressjs/body-parser#bodyparserrawoptions). The `bodyParser` middleware is not customizable as it needs to be raw to be able to parse GitHub webhooks. If you want the body to be under a different format, you can parse the buffer into something else, whether under another middleware function or just in your page code.
	* `subdomain`: (string) The subdomain defined in the URL, but concatenated into one string, periods and all, rather than just an array of period-split values provided by `req.subdomains`. This is an empty string if there is no subdomain in the URL.
		* Examples: `""`, `"www"`, `"api"`, `"some.sub.domain"`
	* `decodedURL`: (string) The request's URI-decoded URL. If there is an error while decoding, [HTTP error 400](https://developer.mozilla.org/en-US/docs/Web/HTTP/Status/400) is thrown.
		* Example: `"/a URL path/with spaces in it?wow isn't it cool"`
	* `dir`: (string) The subdomain directory of the requested file.
		* Examples: `"www"`, `"api"`
	* `queryString`: (?string) Everything after the question mark in the decoded URL, or `undefined` if there is no question mark.
		* Examples: `"v=7wiNUBaK-6M"`, `"magic=real&test=true"`, `"q=awesome&safe=active&ssui=on"`, `"wow isn't it cool"`
	* `decodedPath`: (string) The decoded URL without the query string and without the question mark.
		* Example: `"/a URL path/with spaces in it"`
	* `rawPath`: (string) The raw path to the planted file that was requested.
		* Examples: [Same as in the `rawPath` property of `cube.getRawPath`'s resolution value.](#cube)
	* `branches`: (Array) An array of parent branch strings for the requested file under the planted directory tree. Only use this if you know what you're doing.

ServeCube's middleware runs before any of the middleware you define in [`options.middleware`](#async-serveoptions).

## NJS Files
It is recommended that you read the section on [file structure](#file-structure) before reading this section.

NJS files are in the same JavaScript syntax as JS files, but the difference in file extension is necessary for ServeCube to be able to differentiate between whether these files should be parsed on the client browser (JS) or on the Node server (NJS).

The contents of these files are stored under the tree as asynchronous functions. An NJS file's function is called when the file is requested or loaded.

For every NJS file, an object is passed into the script's scope as its `this` value. This object is known as the script's context. A certain context object is automatically passed when the script is called by an HTTP request, but you can also load an NJS file yourself and define your own context object using `cube.load`. A reference can be found [here](#cube).

Context objects use the following properties.
* `rawPath`: (string) The raw path of the current NJS file.
	* Presence: This property **is always predefined** by ServeCube. This property **is not passed** into loaded context. This property **is not included** in resolved context.
	* Examples: [Same as in the `rawPath` property of `cube.getRawPath`'s resolution value.](#cube)
* `done()`: (Function) The method to call when your script is ready to send an HTTP response or resolve a ServeCube load. This method should always be called once, no more and no less, from any NJS file.
	* Presence: This property **is always predefined** by ServeCube. This property **is not passed** into loaded context. This property **is not included** in resolved context.
* `req`: (Object) The ServeCube request object. This is just the `express` request object, but with a few extra properties defined by ServeCube's middleware. A reference can be found [here](#middleware).
	* Presence: This property **is predefined** by ServeCube for HTTP requests. This property **is passed** into loaded context. This property **is not included** in resolved context.
* `res`: (Object) The `express` response object. A reference can be found [here](https://expressjs.com/en/api.html#res).
	* Presence: This property **is predefined** by ServeCube for HTTP requests. This property **is passed** into loaded context. This property **is not included** in resolved context.
* `method`: (string) The HTTP request method. Use this instead of any properties or methods of `this.req`.
	* Presence: This property **is predefined** by ServeCube for HTTP requests. This property **is passed** into loaded context, which allows the loading of method files. This property **is not included** in resolved context.
	* Examples: `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, `"PATCH"`
* `params`: (Object) An object of the URL template parameters. Object keys are parameter names as defined in the names of the directories and files, and object values are what the client specified in place of those keys in the URL.
	* Presence: This property **is predefined** by ServeCube if URL templating is used under the file's path. This property **is passed** into loaded context, but in the case of conflicting parameter names the passed properties are overwritten. This property **is not included** in resolved context.
	* Example: `{username: "CoolGuy43", message: "123"}` This, for example, would be the parameter object if the raw path is "www/users/{username}/messages/{message}/contents/GET.json.njs" and the client requested a URL with the path "/users/CoolGuy43/messages/123/contents".
* `status`: (number) The HTTP response status code. This property also applies to redirection status. Use this instead of any properties or methods of `this.res`.
	* Presence: This property **is not predefined** by ServeCube. This property **is not passed** into loaded context. This property **is included** in resolved context.
	* Optional
	* Default: `200`, `201` if it is a `POST` request, or `307` if the `redirect` option is defined
* `redirect`: (string) The URL to redirect the client to. Use this instead of any properties or methods of `this.res`.
	* Presence: This property **is not predefined** by ServeCube. This property **is not passed** into loaded context. This property **is included** in resolved context.
	* Optional
	* Examples: `"/test/page"`, `"https://example.com/test/page"`
* `value`: Any body value compatible with `express`'s `res.send` method. A reference can be found [here](https://expressjs.com/en/api.html#res.send). This is the HTTP response body for HTTP requests, or just a regular context property for ServeCube loads. Use this instead of any properties or methods of `this.res`.
	* Presence: This property **is always predefined** by ServeCube as an empty string. This property **is not passed** into loaded context. This property **is included** in resolved context.
	* Required
	* Default: `""`
	* Examples: `"Hello, world!"`, `{cool: true}`, `Buffer.from("whatever")`
* `depth`: (number) The depth of the current context. This value starts at 1 per request. 1 is added whenever the context is passed to another load, and 1 is subtracted after each load is complete.
	* Presence: This property **is always predefined** by ServeCube. This property **is passed** into loaded context. This property **is included** in resolved context.
	* Read-only
* `cache(context)`: (Function | boolean) A function used for server-side load caching. If defined, the script's resolved context is cached by ServeCube (under `cube.loadCache`) and used whenever the file is loaded, whether by HTTP request or not. This function is called whenever it is necessary for ServeCube to retrieve or store such a cached context, as cached contexts are identified by the string returned by this function, known as a cache index. This function is similar in nature to the [HTTP `Vary` response header](https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/Vary), but data is cached on the server rather than the client, and cache identification may vary based on more than just HTTP headers. This may also be set to `true` as an alias of `() => ""`. Cache indexing is per NJS file.
	* Presence: This property **is not predefined** by ServeCube. This property **is not passed** into loaded context. This property **is not included** in resolved context.
	* Optional
	* `context`: (Object) The predefined context object.
	* Returns: (string) The cache index.
	* Examples:
		* `true` This would cached the file without any variance.
		* `context => context.req.queryString` This would vary cached contexts based on the URL's query string.
		* `context => context.req.get("User-Agent")` This would vary cached contexts based on the `User-Agent` header.
		* ``context => `${context.req.get("Content-Type")} ${encodeURIComponent(context.params.user)} ${encodeURIComponent(context.params.message)}` `` This would vary cached contexts based on the `Content-Type` header, the `user` URL parameter, and the `message` URL parameter.

Any properties not on the above list **are passed** into loaded context and **are included** in resolved context.

## Important Notes
* You should never manually edit or remove planted files or directories while ServeCube is running, as they will not be automatically replanted or limbed. The same applies to planting newly created files. ServeCube will only automatically replant and limb when it receives GitHub webhooks. For now, if you aren't using GitHub integration to do things or are using the file system directly, you need to restart ServeCube to limb and replant files, or you can limb and replant them programmatically. If you're just editing the contents of non-NJS files, this does not apply, as only NJS files have their contents cached, and non-NJS files have their contents served directly from the file system.
* Compiled and/or minified files are not renamed after being processed. For example, if you have `test.scss` pushed to your repository, it can contain uncompressed SCSS code which will be transpiled and minified into `test.scss`, the same filename, on the server.
* Due to the limitations of the GitHub API, files you push can only be automatically uploaded to your server if they are 10 MB or less. If you want to upload a file that is greater than 10 MB, you will have to do it manually by alternative means. If you push a file larger than 10 MB, a warning will appear in the Node console.
* Babel has a few limitations which may, depending on your code, require some extra polyfills. See [this page](https://babeljs.io/docs/usage/caveats/) for information on that. To cover these limitations, I recommend using [`core-js`](https://cdnjs.cloudflare.com/ajax/libs/core-js/2.5.7/core.min.js), a general ES5+ browser polyfill, and [`regenerator`](https://cdn.jsdelivr.net/npm/regenerator-runtime@latest/runtime.min.js), a dependency of Babel's accommodation for generators and async functions.
