import { redirect } from 'next/navigation'

export default async function NewProductPage() {
  redirect('/products?create=1')
}
