#!/usr/bin/env node

import fs from 'fs'
import path from 'path'

import { Command } from 'commander'
import { bold, cyan, green, red } from 'picocolors'
import prompts from 'prompts'

import packageJson from '../package.json'
import { createApp } from './create-app'
import { getPkgManager, isFolderEmpty, validateNpmName } from './utils'

let projectPath = ''

const handleSigTerm = () => process.exit(0)

process.on('SIGINT', handleSigTerm)
process.on('SIGTERM', handleSigTerm)

const onPromptState = (state: any) => {
  if (state.aborted) {
    // If we don't re-enable the terminal cursor before exiting
    // the program, the cursor will remain hidden
    process.stdout.write('\x1B[?25h')
    process.stdout.write('\n')
    process.exit(1)
  }
}

const program = new Command(packageJson.name)
  .version(packageJson.version)
  .arguments('[project-directory]')
  .usage(`${green('<project-directory>')} [options]`)
  .action((name) => {
    projectPath = name
  })
  .option(
    '--eslint',
    `

  Initialize with eslint config.
`,
  )
  .option(
    '--biome',
    `

  Initialize with biome config.
`,
  )
  .option(
    '--prettier',
    `

  Initialize with prettier config.
`,
  )
  .allowUnknownOption()
  .parse(process.argv)

const packageManager = getPkgManager()

async function run(): Promise<void> {
  if (typeof projectPath === 'string') {
    projectPath = projectPath.trim()
  }

  if (!projectPath) {
    const res = await prompts({
      onState: onPromptState,
      type: 'text',
      name: 'path',
      message: 'What is your project named?',
      initial: 'my-app',
      validate: (name) => {
        const validation = validateNpmName(path.basename(path.resolve(name)))
        if (validation.valid) {
          return true
        }
        return `Invalid project name: ${validation.problems?.[0]}`
      },
    })

    if (typeof res.path === 'string') {
      projectPath = res.path.trim()
    }
  }

  if (!projectPath) {
    console.log(
      `\nPlease specify the project directory:\n  ${cyan(program.name())} ${green(
        '<project-directory>',
      )}\nFor example:\n  ${cyan(program.name())} ${green('my-app')}\n\nRun ${cyan(
        `${program.name()} --help`,
      )} to see all options.`,
    )

    process.exit(1)
  }

  const resolvedProjectPath = path.resolve(projectPath)
  const projectName = path.basename(resolvedProjectPath)

  const { valid, problems } = validateNpmName(projectName)

  if (!valid) {
    console.error(`Could not create a project called ${red(`"${projectName}"`)} because of npm naming restrictions:`)

    if (problems != null) {
      for (const p of problems) {
        console.error(`    ${red(bold('*'))} ${p}`)
      }
    }

    process.exit(1)
  }

  /**
   * Verify the project dir is empty or doesn't exist
   */
  const root = path.resolve(resolvedProjectPath)
  const appName = path.basename(root)
  const folderExists = fs.existsSync(root)

  if (folderExists && !isFolderEmpty(root, appName)) {
    process.exit(1)
  }

  const config = {
    biome: {
      formatter: Boolean(program.opts().biome),
      linter: Boolean(program.opts().biome),
    },
    eslint: Boolean(program.opts().eslint),
    prettier: Boolean(program.opts().prettier),
  }

  if (
    (!process.argv.includes('--biome') && !process.argv.includes('--prettier')) ||
    (process.argv.includes('--biome') && process.argv.includes('--prettier'))
  ) {
    const { formatter } = await prompts({
      onState: onPromptState,
      type: 'select',
      name: 'formatter',
      message: 'Which formatter tool would you like to use?',
      choices: [
        { title: 'Biome', value: 'biome' },
        { title: 'Prettier', value: 'prettier' },
        { title: 'None of these', value: 'none' },
      ],
    })

    if (formatter === 'biome') {
      config.biome.formatter = true
      config.prettier = false
    }

    if (formatter === 'prettier') {
      config.biome.formatter = false
      config.prettier = true
    }

    if (formatter === 'none') {
      config.biome.formatter = false
      config.prettier = false
    }
  }

  if (
    (!process.argv.includes('--biome') && !process.argv.includes('--eslint')) ||
    (process.argv.includes('--biome') && process.argv.includes('--eslint'))
  ) {
    const { linter } = await prompts({
      onState: onPromptState,
      type: 'select',
      name: 'linter',
      message: 'Which linter tool would you like to use?',
      choices: [
        { title: 'Biome', value: 'biome' },
        { title: 'ESLint', value: 'eslint' },
        { title: 'None of these', value: 'none' },
      ],
    })

    if (linter === 'biome') {
      config.biome.linter = true
      config.eslint = false
    }

    if (linter === 'eslint') {
      config.biome.linter = false
      config.eslint = true
    }

    if (linter === 'none') {
      config.biome.linter = false
      config.eslint = false
    }
  }

  await createApp({
    appPath: resolvedProjectPath,
    linter: config.eslint ? 'eslint' : config.biome.linter ? 'biome' : null,
    formatter: config.prettier ? 'prettier' : config.biome.formatter ? 'biome' : null,
    packageManager,
  })
}

run()
