export const DASHBOARD_TERMS_UPDATED_AT = 'May 14, 2026'

export interface TermsSection {
  title: string
  body: string[]
}

export const DASHBOARD_TERMS_SECTIONS: TermsSection[] = [
  {
    title: '1. Acceptance and Scope',
    body: [
      'These Dashboard Terms of Service govern use of the ClawMax Dashboard, related runtime controls, skill installation flows, agent import/export features, and any connected local, on-prem, or hosted execution environment made available through the Dashboard.',
      'By using the Dashboard, importing agents, installing skills, running setup commands, or enabling external integrations, you agree to these terms for your use of the Dashboard and the connected runtime environment.',
    ],
  },
  {
    title: '2. Your Responsibility for Agents, Skills, and Integrations',
    body: [
      'You are responsible for the agents, skills, prompts, files, external services, credentials, and commands you choose to install, connect, import, or run through the Dashboard.',
      'Skills and imported agents may expand an agent’s ability to read files, call APIs, modify data, access third-party tools, or run local commands. You are responsible for reviewing those capabilities before enabling them.',
    ],
  },
  {
    title: '3. External Skills, Registries, and Third-Party Content',
    body: [
      'Skills imported from registries, GitHub repositories, local directories, partner integrations, or other third-party sources are not automatically audited or guaranteed by the Dashboard.',
      'You should treat external skills, setup scripts, and install commands as potentially sensitive or high-impact until you have reviewed what they do, what binaries they require, what credentials they need, and what systems they can reach.',
      'You are responsible for complying with third-party licenses, terms, usage limits, and applicable policies when using external skills, registries, CLIs, APIs, or connected services.',
    ],
  },
  {
    title: '4. Machine Commands and Setup Actions',
    body: [
      'The Dashboard may help you run machine-level setup actions such as package installs, local CLI setup commands, or skill onboarding steps. Those actions can change your machine or runtime environment.',
      'You are responsible for verifying that those commands are appropriate for your environment before you run them. If a command installs software, changes configuration, authenticates a third-party account, or grants new access, you accept that risk and responsibility.',
    ],
  },
  {
    title: '5. Credentials, Secrets, and Connected Accounts',
    body: [
      'You are responsible for all API keys, secrets, OAuth credentials, tokens, account connections, and local runtime configuration you provide to the Dashboard or to connected agents and skills.',
      'You should only connect accounts and credentials that you are authorized to use, and you should rotate or revoke them if you suspect misuse, overreach, or accidental exposure.',
    ],
  },
  {
    title: '6. Imported Agents, Bundles, and Workspace Data',
    body: [
      'Imported agents, ZIP bundles, and local directories may contain prompts, instructions, files, skill references, or metadata that affect runtime behavior. Review imported content before you rely on it in production or sensitive environments.',
      'You are responsible for the accuracy, legality, and safety of imported content and for any consequences of restoring, running, or reusing that content in your workspace.',
    ],
  },
  {
    title: '7. No Warranty; Use at Your Own Risk',
    body: [
      'The Dashboard, imported content, and external skills are provided on an “as is” and “as available” basis to the maximum extent permitted by law.',
      'We do not guarantee that any particular skill, agent, setup flow, or external integration is safe, error-free, secure, suitable for your environment, or fit for any specific purpose.',
    ],
  },
  {
    title: '8. Limits on Liability',
    body: [
      'To the maximum extent permitted by law, the Dashboard authors, maintainers, and distributors are not liable for indirect, incidental, special, consequential, exemplary, or punitive damages, or for loss of data, profits, revenue, business, goodwill, or security arising from use of the Dashboard or any imported or installed skills, agents, binaries, or integrations.',
      'If liability cannot be excluded, it will be limited to the minimum amount permitted by applicable law.',
    ],
  },
  {
    title: '9. Acceptable Use',
    body: [
      'You may not use the Dashboard, agents, or skills to violate law, regulation, contract, or the rights of others, or to deploy malware, steal credentials, exfiltrate data, or abuse third-party services.',
      'You are responsible for evaluating whether a given workflow, skill, integration, or runtime action is appropriate for your environment and governance requirements.',
    ],
  },
  {
    title: '10. Changes to These Terms',
    body: [
      'These Dashboard Terms may be updated over time. Continued use of the Dashboard after updated terms are made available means you accept the updated version for future use.',
    ],
  },
]
