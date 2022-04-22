import { ExistingMetaHandler, AnchorHandler, SrcHrefHandler, InsertMetaTagHandler, CSSHandler, JSHandler } from "./handlers";
import { headersToString } from "./utils";

export type CSPInlineHash = "sha256" | "sha384" | "sha512";
export type CSPInlineMethod = "nonce" | CSPInlineHash;
export type CSPInjectionMethod = "meta-tags" | "headers";

export interface CSPOptions {
    method: CSPInjectionMethod;
    inline: CSPInlineMethod;
}

export const InjectCSP = (options: CSPOptions): PagesFunction<{}> => {
    let headers: Map<string, string[]>;

    return async ({ next }) => {
        headers = new Map<string, Array<string>>();
        headers.set('default-src', ["'self'"]);

        // This pass serves three purposes:
        //  - It records all instances where CSP headers are required
        //  - It adds nonces/hashes to inline scripts/styles
        //  - Parse any CSP headers that are present in any existing meta tags
        const r = new HTMLRewriter()
            .on("meta", new ExistingMetaHandler(headers))
            .on('style', new CSSHandler(headers, options.inline))
            .on('script', new JSHandler(headers, options.inline))
            .on('a', new AnchorHandler(headers))
            .on('*', new SrcHrefHandler(headers))
            .transform(await next());

        // WAIT for first pass to finish. This is required since we need to wait for all of the above handlers to finish before we can inject the CSP headers
        // Hopefully there is a better way to do this
        await r.clone().text();

        if (options.method === "meta-tags") {
            // If method is "meta-tags", this pass adds a meta tag for the CSP directive, and adds the headers to it
            // This assumes that any existing CSP meta tags have been removed and won't interfere
            return new HTMLRewriter()
                .on("head", new InsertMetaTagHandler(headers))
                .transform(r);
        } else {
            const newHeaders = new Headers([...r.headers.entries()]);
            newHeaders.set("Content-Security-Policy", headersToString(headers));
            return new Response(r.body, { ...r, headers: newHeaders });
        }
    };
};