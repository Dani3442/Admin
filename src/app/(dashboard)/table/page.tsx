import { redirect } from 'next/navigation'

export default function TablePage() {
  redirect('/products?layout=table')
}
