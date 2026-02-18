/** @type {import('./$types').PageLoad} */
export async function load({ params }) {
	return { communityNpub: params.communityNpub || '' };
}
