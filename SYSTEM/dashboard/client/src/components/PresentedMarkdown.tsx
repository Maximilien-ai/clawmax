import ReactMarkdown, { type Options } from 'react-markdown'
import { remarkCitationPresentation } from '../lib/citationPresentation'
export default function PresentedMarkdown({ remarkPlugins = [], ...props }: Options) {
  return <ReactMarkdown {...props} remarkPlugins={[...remarkPlugins, remarkCitationPresentation]} />
}
