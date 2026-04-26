import { products } from './products.model.js'

export function getProducts() {
  return products
}

export function getProductById(productId: string | undefined) {
  return products.find((product) => product.id === productId)
}
