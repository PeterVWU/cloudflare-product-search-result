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
	DB: D1Database;
}


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
	link: string,
	price: number,
	update_at: string
}
interface ProductLinksType {
	sku: string,
	product_name: string,
	top_links: ProductLinkType[]
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
				link: item.link,
				price: 0, // You'll need to implement price scraping logic
				update_at: new Date().toISOString()
			}));
		} else {
			return [];
		}
	} catch (error) {
		console.error('Error performing Google search:', error);
		return [];
	}
}

async function prepareDatabase(env: Env): Promise<number> {
	const productListUrl = "https://vapewholesaleusa.com/report/view/59035b598250d9a84f28300693bdf88f2109b005.json";
	const response = await fetch(productListUrl);
	const data = await response.json() as MagentoResponseBodyType;
	const productList = data.rows;

	let savedProducts = 0;
	for (const product of productList.slice(0, 3)) {
		const sku = product["catalog_product_entity|sku"];
		const productName = product["catalog_product_entity|name"];
		const links = await googleSearch(productName);

		const productData: ProductLinksType = {
			sku,
			product_name: productName,
			top_links: links
		};

		await saveOrUpdateProduct(env, productData);
		savedProducts++;
	}

	return savedProducts;
}

async function saveOrUpdateProduct(env: Env, product: ProductLinksType): Promise<void> {
	const stmt = env.DB.prepare(`
			  INSERT INTO products (sku, product_name, top_links)
			  VALUES (?, ?, ?)
			  ON CONFLICT(sku) DO UPDATE SET
			  product_name = excluded.product_name,
			  top_links = excluded.top_links
			`);

	try {
		await stmt.bind(
			product.sku,
			product.product_name,
			JSON.stringify(product.top_links)
		).run();
		console.log(`Saved/Updated product: ${product.sku}`);
	} catch (error) {
		console.error(`Error saving/updating product ${product.sku}:`, error);
	}
}
export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url);
		const path = url.pathname;

		if (path === '/prepare' && request.method === 'GET') {
			try {
				const savedProducts = await prepareDatabase(env);

				// Count total products after preparation
				const stmt = env.DB.prepare('SELECT COUNT(*) as count FROM products');
				const result = await stmt.first<{ count: number }>();
				const totalProducts = result?.count || 0;

				return new Response(JSON.stringify({
					message: `Database prepared successfully. Saved or updated ${savedProducts} products.`,
					productCount: totalProducts
				}), {
					headers: { 'Content-Type': 'application/json' }
				});
			} catch (error: any) {
				console.error('Error preparing database:', error);
				return new Response(JSON.stringify({
					error: 'Failed to prepare database',
					details: error.message
				}), {
					status: 500,
					headers: { 'Content-Type': 'application/json' }
				});
			}
		}

		return new Response('Not Found', { status: 404 });
	},
};