export interface PluginAiCreateCopyInput {
  objectKind?: string
  name?: string
  singular?: string
}

export interface PluginAiCreateCopy {
  title: string
  intro: string
  placeholder: string
  editorPlaceholder: string
}

export function getPluginAiCreateCopy(plugin: PluginAiCreateCopyInput): PluginAiCreateCopy {
  if (plugin.objectKind === 'optimization-plan') {
    return {
      title: 'AI Create Optimization Plan',
      intro: 'Describe the outcome you want to improve, such as cost, tokens, speed, quality, or schedule, and name the agent or workflow it should apply to. Next will score the prompt and prepare a reviewable plan.',
      placeholder: "e.g., Reduce the research workflow's monthly cost by 30% while keeping quality above 85%; recommend models and schedule changes.",
      editorPlaceholder: 'Describe the budget, quality, speed, token, model, or schedule outcome you want to improve...',
    }
  }
  if (plugin.objectKind === 'lifecycle-view') {
    return {
      title: 'AI Create Lifecycle',
      intro: 'Describe what you want to learn about an agent, workflow, group, or community. Name the objects to inspect, the time window, and the events or artifacts that matter. Next will score the prompt and prepare a reviewable lifecycle view.',
      placeholder: 'e.g., Show the research agent lifecycle for the last 30 days, including creation, model changes, file updates, conversations, and recent outputs.',
      editorPlaceholder: 'Describe the agent, workflow, group, or community history you want to inspect...',
    }
  }
  const singular = plugin.singular || plugin.name || 'plugin'
  return {
    title: `AI Create ${singular}`,
    intro: `Describe what you want this ${singular.toLowerCase()} to do. Next will score the prompt and prepare a reviewable specification.`,
    placeholder: `Describe the ${singular.toLowerCase()} to create`,
    editorPlaceholder: `Describe the ${singular.toLowerCase()} you want to create...`,
  }
}
