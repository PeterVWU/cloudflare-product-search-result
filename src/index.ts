/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

export interface Env {
	// Example binding to KV. Learn more at https://developers.cloudflare.com/workers/runtime-apis/kv/
	// MY_KV_NAMESPACE: KVNamespace;
	//
	// Example binding to Durable Object. Learn more at https://developers.cloudflare.com/workers/runtime-apis/durable-objects/
	// MY_DURABLE_OBJECT: DurableObjectNamespace;
	//
	// Example binding to R2. Learn more at https://developers.cloudflare.com/workers/runtime-apis/r2/
	// MY_BUCKET: R2Bucket;
	//
	// Example binding to a Service. Learn more at https://developers.cloudflare.com/workers/runtime-apis/service-bindings/
	// MY_SERVICE: Fetcher;
	//
	// Example binding to a Queue. Learn more at https://developers.cloudflare.com/queues/javascript-apis/
	// MY_QUEUE: Queue;
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const API_KEY = 'AIzaSyC62ULyxZmIBwjOHWt2O0Hfkj_hwBdIYc4';
		const SEARCH_ENGINE_ID = '76e35492042ab4de6';
		interface MagentoProductType {
			"catalog_product_entity|sku": string,
			"catalog_product_entity|name": string,
			"sales_order|entity_id__cnt": string
		}
		interface MagentoResponseBodyType {
			columns: Object[],
			rows: MagentoProductType[]
		}

		interface GoogleSearchResponseBodyType {
			items: {
				title: string,
				link: string,
				snippet: string,
			}[]
		}
		interface ProductLinkType {
			title: string,
			link: string
		}
		interface ProductLinksType {
			name: string,
			links: ProductLinkType[]
		}
		const productListUrl = "https://vapewholesaleusa.com/report/view/59035b598250d9a84f28300693bdf88f2109b005.json"

		async function googleSearch(query: string): Promise<ProductLinkType[]> {
			console.log('searching :', query)
			const url = `https://www.googleapis.com/customsearch/v1?key=${API_KEY}&cx=${SEARCH_ENGINE_ID}&q=${encodeURIComponent(query)}`;

			try {
				const response = await fetch(url);
				const data = await response.json() as GoogleSearchResponseBodyType;
				if (data.items && data.items.length > 0) {
					return data.items.slice(0, 5).map(item => ({
						title: item.title,
						link: item.link,
					}));
				} else {
					return [];
				}
			} catch (error) {
				console.error('Error performing Google search:', error);
				return [];
			}
		}

		const response = await (fetch(productListUrl) as unknown) as Response
		const data = await response.json() as MagentoResponseBodyType
		const productList = data.rows
		console.log('productList.length', productList.length)
		let productLinks: ProductLinksType[] = []
		for (const product in productList.slice(0, 1)) {
			const productName = productList[product]["catalog_product_entity|name"]
			const links = await googleSearch(productName);
			productLinks.push({ name: productName, links: links })
		}
		console.log('productLinks', productLinks)

		return Response.json(productLinks)
	},
};
