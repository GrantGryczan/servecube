# ServeCube
A modular Node web framework optimized for websites and RESTful web services for your development convenience
```
npm install servecube --save
```
**Node 9.11.1+** is required.

## Features
* This framework wraps [`express`](https://github.com/expressjs/express) and has its features built in and accessible.
* You can optionally connect your server to a GitHub webhook so that source code is automatically uploaded to the server.
* With GitHub connection comes automatic HTML, JS, and CSS minification.
* The framework is very modular so that each page or endpoint (and HTTP method, optionally) can be its own file.
* Any file type can be served to the client, and the Node JS file type (NJS) is used for server-side JavaScript evaluation.
* With JavaScript evaluation comes document templating (and everything else you can do with JavaScript, duh).
* URL template parameters are available.
* Multiple subdomains with different functions in one server are accepted.

## Version Format
If any updates that might affect your current ServeCube implementation are applied, the second digit in the version number is raised. Thus, if you are to update the ServeCube module in your package, you should check the docs if it is the second digit that increased. If the third digit increases, it is only a bug fix or small update that should not deem your code dysfunctional.

## Usage
This code should be used to load the ServeCube module.
```js
const {serve, html} = require("servecube");
```

### async serve(options)
Initiate your cube web server.
* `options`: (Object) The cube's options.
  * `eval`: (Function) This should always be set to `v => eval(v)` so ServeCube is able to evaluate your NJS files under the correct scope.
    * Optional but recommended
    * Default: `eval`
    * Example: `v => eval(v)`
  * `domain`: (String) Your website's domain (without any subdomain, and with the port if necessary for URL access).
    * Required
    * Examples: `"example.com"`, `"localhost:8080"`, `"miroware.io"`
  * `basePath`: (String) An absolute path to your current working directory, which should contain your `package.json` file and your main script. This value is prepended to every relative path you use. This directory's file structure is cached by ServeCube. If you connect GitHub to ServeCube, the repository's base directory is synced to this one.
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
  * Soon...
* Rejects: (ServeCubeError) An error that occured while initiating the cube.

More documentation to come!

## Important Notes
* Due to the limitations of the GitHub API, files you push can only be automatically uploaded to your server if they are 10 MB or less. If you want to upload a file that is greater than 10 MB, you will have to do it manually by alternative means. If you push a file larger than 10 MB, a warning will appear in the Node console.
