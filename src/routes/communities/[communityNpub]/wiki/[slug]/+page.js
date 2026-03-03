export const ssr = false;
export const csr = true;

/** @type {import('./$types').PageLoad} */
export async function load({ params }) {
	return {
		communityNpub: params.communityNpub || '',
		slug: params.slug || ''
	};
}
