// Synthetic-only layout fixture, not imported by the application.
import React from 'react'
import { createRoot } from 'react-dom/client'
import AIPromptEditorModal from '../src/components/AIPromptEditorModal'
import '../src/index.css'
function Fixture() {
  const [saved, setSaved] = React.useState('')
  return <><output>{saved}</output><AIPromptEditorModal isOpen title="Agent AI Editor"
    initialValue="create a double agent" qualityDomain="agent" rows={16}
    onClose={() => {}} onSave={setSaved} onSaveAndGenerate={setSaved}
    onExpandWithAi={async (value, format, guidance) => {
      await new Promise(resolve => setTimeout(resolve, 100))
      if (guidance === 'fail') throw new Error('Synthetic service unavailable')
      return `${value}\nExpanded: ${guidance} (${format})`
    }} /></>
}
createRoot(document.getElementById('root')!).render(<Fixture />)
