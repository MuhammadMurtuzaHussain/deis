// The desktop app on Polar: €9.99 once, with a licence key. The same id is in desktop/config.json
// (buyUrl), which the packaged app reads. Judges and visitors reach checkout through BUY_HREF.
export const PRODUCT_ID = "fb94fe7f-d0f8-49a0-8854-4bbe41f25496";
export const BUY_HREF = `/checkout?products=${PRODUCT_ID}`;

/** Support for buyers and anyone else: a real inbox, answered by the author. */
export const SUPPORT_EMAIL = "hello@deiscareers.tech";
