# ServeCube
A modular Node web framework optimized for websites and RESTful web services for your development convenience
```
npm install servecube --save
```
**Node 9.11.1+** is required.

This documentation assumes you already have a fair understanding of JavaScript, Node, and how the web works.

## Features
* This framework wraps [`express`](https://github.com/expressjs/express) and has many of its features built in and accessible.
* You can optionally connect your server to a GitHub webhook so that source code is automatically uploaded to the server.
* With GitHub connection comes automatic HTML, JS, and CSS minification, and Babel JS compilation.
* The framework is very modular so that each page or endpoint (and HTTP method, optionally) can be its own file.
* Any file type can be served to the client, and the Node JS file type (NJS) is used for server-side JavaScript evaluation.
* With JavaScript evaluation comes document templating (and everything else you can do with JavaScript, duh).
* URL parameter templating is available.
* Multiple subdomains with different functions in one server are accepted.

## Version Format
If any updates that might affect your current ServeCube implementation are applied, the second digit in the version number is raised. Thus, if you are to update the ServeCube module in your package, you should check the docs for relevant updates if it is the second digit that increased. If the third digit increases, it is only a bug fix or small update that will not typically deem your code dysfunctional.

## Terminology
* The ServeCube **tree** is a cache of much of your working directory's file structure.
* A **planted** file is a file cached under the tree. These files have potential to be served to users visiting your website.
* To **limb** a file is to remove it from the tree and clear all cached instances of it by ServeCube.
* To **replant** a file is to load a file to the tree again.
* A **page file** is an NJS or HTML file.

## File Structure
Under your working directory, it is ideal that you have at least these two directories created: `www` and `error`. (These can be renamed, and more can be used for multiple subdomains through `options.subdomains`. [Here is documentation.](#async-serveoptions)) These are your public directories. Public directories and their contents are planted.

**HTML files** can end with ".html" or ".htm", case-insensitive.

**NJS files** can end with ".njs", case-insensitive. They are your Node JS files, analogous to PHP files, where JavaScript code is evaluated on the server before it is served to the client. These files can have double extensions (like "file.png.njs") for ServeCube to set the content type to that of the specified extension. By default the content type is HTML.

Only the contents of NJS files are cached under the planted file's metadata by ServeCube, so that JavaScript evaluation is faster. All other file types, including HTML, are piped directly from the file system to the response when requested.

For every planted directory, the following information is true.
* They can contain one index file, which is served when a user requests the directory's path as a directory (favorably _with_ an ending slash).
  * Index files are named "index", case-insensitive.
  * They must be page files.
* They can contain method files, which are served when a user requests the directory's path as a file (favorably _without_ an ending slash).
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

All directories and files can use URL parameter templating in the filename. To define a URL parameter, simple place a parameter name in curly brackets into the filename.

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
* `POST /users/CoolGuy43/messages` -> `www/users/{name}/messages/POST.json.njs`
* `GET /users/CoolGuy43/messages/123/contents` -> `www/users/{name}/messages/{id}/contents/GET.json.njs`
* `PUT /users/CoolGuy43` -> `www/users/{name}/PUT.json.njs`
* `DELETE /all/this/nonsense` -> `www/all/this/nonsense.njs`
* `DELETE /all/this/trash` -> `www/all/this/{other}.njs`
* `GET /page_which_does_not_exist` -> `error/404` -> `error/{status}.njs`

[Here is the documentation on how to properly utilize the NJS file format.](#njs-files)

## Usage
This code should be used to load the ServeCube module.
```js
const {serve, html} = require("servecube");
```

### async serve(options)
Initiate your cube web server.
* `options`: (Object) The cube's options.
  * `eval(string)`: (Function) This should always be set to `v => eval(v)` so ServeCube is able to evaluate your NJS files under the correct scope.
    * Optional but recommended
    * Default: `eval`
    * Example: `v => eval(v)`
  * `domain`: (String) Your website's domain (without any subdomain, and with the port if necessary for URL access).
    * Required
    * Examples: `"example.com"`, `"localhost:8080"`, `"miroware.io"`
  * `basePath`: (String) An absolute path to your current working directory, which should contain your `package.json` file. This value is prepended to every relative path you use. This directory's file structure is cached by ServeCube. If you connect GitHub to ServeCube, the repository's base directory is synced to this one.
    * Optional
    * Default: `process.cwd()`
    * Examples: `"/home/web/"`, `"/var/www/"`
  * `errorDir`: (String) A relative path to your error directory.
    * Optional
    * Examples: `"error"`, `"err"`
  * `httpPort`: (Number) The port number listened to for HTTP traffic.
    * Optional
    * Default: `8080`
    * Examples: `80`, `3000`, `8888`, `8000`, `8081`
  * `tls`: (Object) Options for `https.createServer`. A reference can be found [here](https://nodejs.org/api/https.html#https_https_createserver_options_requestlistener). Setting this property enables HTTPS for your cube web server.
    * Optional
    * Example: `{key: fs.readFileSync("ssl/privkey.pem"), cert: fs.readFileSync("ssl/cert.pem"), ca: fs.readFileSync("ssl/chain.pem")}`
  * `httpsPort`: (Number) The port number listened to for HTTPS traffic.
    * Optional
    * Default: `8443`
    * Examples: `443`, `3443`, `4000`, `8444`
  * `httpsRedirect`: (Boolean) Whether to redirect HTTP traffic to HTTPS traffic.
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
  * `githubSecret`: (String) Your GitHub webhook's secret. Setting this property enables GitHub integration.
    * Optional
  * `githubSubdomain`: (String) The subdomain to accept GitHub webhook requests on, or an empty string to accept on no-subdomain.
    * Optional
    * Default: `""`
    * Examples: `"api"`, `"github"`, `"www"`
  * `githubPayloadURL`: (String) Your GitHub webhook's payload URL. This is the URL GitHub sends data to when you push data to your repository. A request's decoded URL has to be equal to it for GitHub integration to be triggered.
    * Required if GitHub integration is enabled
    * Examples: `"/githubwebhook"`, `"/github"`, `"/push"`, `"/commits"`
  * `githubToken`: (String) A GitHub personal access token to increase the GitHub API rate limit from 60 to 5000 requests per hour. This is necessary if you want to be able to successfully push more than 60 files to the web server per hour while using GitHub integration.
    * Optional
  * `middleware`: (Array) This is an array of `express` middleware functions.
    * Optional
    * Example: `[require("cookie-parser")()]`
* Resolves: (Object) A cube web server.
  * `app`: (Object) The `express` app. A reference can be found [here](https://expressjs.com/en/api.html#app).
  * `tree`: (Object) The planted directory tree. Only use this if you know what you're doing.
  * `async getRawPath(path, method)`: Get a planted file's metadata based on its public path.
    * `path`: (String) The input path. It should start with a base directory, followed by a URL-friendly resource path (which starts with a slash). This value should already be URI-decoded.
      * Required
      * Examples: `"www/"`, `"www/test/page/"`, `"error/404"`, `"api/users/CoolGuy43/profile"`, `"www/images/Nice logo.png"`
    * `method`: (String) The HTTP method to use in finding the requested path if applicable.
      * Optional
      * Default: `"GET"`
      * Examples: `"GET"`, `"POST"`, `"PUT"`, `"DELETE"`, `"PATCH"`
    * Resolves: (Object) The output file metadata.
      * `rawPath`: (?String) The relative path to the file, or `undefined` if the requested file is not planted.
        * Examples: `"www/index.html"`, `"www/test/page/index.NJS"`, `"error/404.njs"`, `"api/users/{username}/profile/GET.njs"`, `"www/images/Nice logo.png"`
      * `params`: (?Object) All of the requested path template parameters. Keys are parameter names, and values are what the keys were substituted with in the path string. This property is unset if there are no parameters.
        * More information soon...
      * `methods`: (?Array) All of the allowed HTTP methods you can request the file with through the path's method files. This property is unset if no planted method files exist for the requested path.
        * Examples: `["POST", "PUT", "PATCH"]`, `["GET"]`
      * `methodNotAllowed`: (?Boolean) `true` if method files exist but there is no planted file for the requested method, unset if not.
      * `hasIndex`: (?Boolean) Whether the requested directory has an index. This is unset if the planted file is not a directory.
      * `async func()`: (?Function) The function to call to execute the planted file, or `undefined` if the file is not an NJS file. Only use this if you know what you're doing.
  * `limb(rawPath)`: (Function) Remove a file from the tree. This method will not delete the file on the file system.
    * `rawPath`: (String) The relative path to the file.
      * Required
      * Examples: Same as in the `rawPath` property of `cube.getRawPath`'s resolution value.
  * `async replant(rawPath)`: (Function) Refresh a planted file in the tree. The file will be automatically limbed, if it is not already, before it is replanted. This method will read from the file system.
    * `rawPath`: Same as in `cube.limb`.
  * `async load(path, context)`: (Function) Load and execute a planted file.
    * `path`: (String) Any `cube.getRawPath`-compatible `path` parameter.
      * Required
    * `context`: (Object) The context of the file, if it is an NJS file. This is what `this` will be set to from inside the file's execution. It is recommended that, whenever you use this method from within an NJS file, you set this property to `this` or an object that spreads `this`.
      * Optional
      * Default: `{}`
      * Examples: `this`, `{...this, method: "POST"}`, `{status: 404}`, `{test: true, magic: "real"}`
      * More information soon...
  * `loadCache`: (Object) All of the cached request contexts for caching the `cube.load` method. Only use this if you know what you're doing.

More documentation to come!

## Important Notes
* Due to the limitations of the GitHub API, files you push can only be automatically uploaded to your server if they are 10 MB or less. If you want to upload a file that is greater than 10 MB, you will have to do it manually by alternative means. If you push a file larger than 10 MB, a warning will appear in the Node console.
