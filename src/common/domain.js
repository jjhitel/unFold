import { parseDomain, fromUrl, NO_HOSTNAME, ParseResultType } from "parse-domain";

export function getETLD1(input, opts = {}) {
    if (!input || typeof input !== "string")
        return null;
    const maybeHost = fromUrl(input);
    const hostname = (maybeHost === NO_HOSTNAME ? input : maybeHost) || "";
    const res = parseDomain(hostname);

    if (res.type !== ParseResultType.Listed)
        return null;

    const useIcann = opts.icannOnly === true || opts.allowPrivateDomains === false;
    const base = useIcann ? res.icann : res;
    const { domain, topLevelDomains } = base;
    return domain ? `${domain}.${topLevelDomains.join(".")}` : null;
}

export function sameETLD1(a, b, opts = {}) {
    const da = getETLD1(a, opts);
    const db = getETLD1(b, opts);
    return da !== null && db !== null && da === db;
}
