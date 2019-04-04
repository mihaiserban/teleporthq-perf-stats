const { join } = require('path')
const fetch = require('node-fetch')
const pidUsage = require('pidusage')
const { promisify } = require('util')
const { writeFile: writeFileOrig } = require('fs')
const { exec: execSync, spawn } = require('child_process')

const { getDirSize, getFileSize, getBinarySize } = require('./getSizes')

const execP = promisify(execSync)
const writeFile = promisify(writeFileOrig)
const exec = cmd => execP(cmd, { env: { ...process.env, GITHUB_TOKEN: '' } })

const MAIN_REPO = 'teleporthq/teleport-code-generators'
const GIT_ROOT = 'https://github.com/'

//github token needs repo scope
const GITHUB_ACCESS_TOKEN = process.env.GITHUB_ACCESS_TOKEN || ''

const uidlSamples = [
  './uidl-samples/component-author-card',
  './uidl-samples/component-card-list',
  './uidl-samples/component-tab-selector',
]

const resetHead = async (repoDir, headTarget) => {
  console.log(`Resetting head of ${repoDir} to ${headTarget}`)
  await exec(`cd ${repoDir} && git reset --hard ${headTarget}`)
  const { stdout: commitSHA } = await exec(`git rev-parse HEAD`)
  return commitSHA
}

const checkoutRepo = async (repo, ref, outDir) => {
  const url = GIT_ROOT + repo
  console.log(`Cloning ${url} to ${outDir}`)
  await exec(`rm -rf ${outDir}`)
  await exec(`git clone ${url} ${outDir}`)
  await exec(`cd ${outDir} && git checkout ${ref}`)
}

const buildRepo = async dir => {
  console.log(`Building next in ${dir}`)
  await exec(`cd ${dir} && yarn install`)
}

const getTags = async () => {
  const { stdout } = await exec('git tag')
  const tags = stdout.trim().split('\n')
  return tags
}

const getTagRefString = async tag => {
  return `refs/tags/${tag}`
}

const getCurrentTag = async () => {
  const { stdout } = await exec('git describe --tags')
  return stdout.trim()
}

const getStats = async tag => {
  //1. get project size, including node_modules
  const repoSize = await getDirSize(tag)

  return { repoSize }
}

const measureComponents = async components => {
  //time, size for each component

  //build react components
  const measurements = { vue: {}, react: {} }
  for (let i = 0; i < components.length; i++) {
    const component = components[i]

    const dateStart = new Date().getTime()
    const { stdout: componentCode, stderr } = await exec(
      `UIDL_PATH='${component}' node test-project/generateReact.js`
    )

    if (stderr && stderr.length > 0) continue

    const dateEnd = new Date().getTime()

    const timeSpent = dateEnd - dateStart

    const componentBytes = getBinarySize(componentCode)

    measurements.react[component] = {
      time: timeSpent,
      size: componentBytes,
    }
  }
  return measurements
}

postResultsToGithub = async result => {
  ///repos/:owner/:repo/issues/:number/comments
  const res = await fetch(
    `https://api.github.com/repos/mihaiserban/teleporthq-perf-stats/issues/1/comments?access_token=${GITHUB_ACCESS_TOKEN}`,
    {
      method: 'POST',
      body: JSON.stringify({
        body: result,
      }),
    }
  )
  console.log(res)
}

run = async () => {
  const currentTag = await getCurrentTag()
  const tags = await getTags()

  console.log(`current tag: ${currentTag}`)
  console.log(`available tags: ${tags}`)

  const measurements = {}

  // WIP: checkout each version, possible to get repo sizes, build times, etc.
  // for (let i = 0; i < tags.length; i++) {
  //   const tag = tags[i]
  //   const gitRef = await getTagRefString(tag)

  //   //checkout ref
  //   await exec(`mkdir ${tag}`)
  //   await checkoutRepo(MAIN_REPO, gitRef, tag)

  //   //build repo
  //   await buildRepo(tag)

  //   //get stats for each tag
  //   measurements[tag] = await getStats(tag)

  //   //cleanup
  //   await exec(`rm -rf ${tag}`)
  // }

  //install each version in the test project
  for (let i = 0; i < tags.length; i++) {
    try {
      const tag = tags[i]

      //build repo
      const packageVersion = tag.replace('v.', '')
      await exec(
        `cd test-project && yarn add @teleporthq/teleport-code-generators@${packageVersion}`
      )
      await buildRepo('test-project')

      //get stats for each tag
      const componentStats = await measureComponents(uidlSamples)

      measurements[tag] = componentStats

      //cleanup
      await exec(
        `cd test-project && yarn remove @teleporthq/teleport-code-generators`
      )
      await exec(`rm -rf test-project/node_modules`)
    } catch (error) {}
  }

  console.log(JSON.stringify(measurements, null, 2))
  await postResultsToGithub(JSON.stringify(measurements, null, 2))
}

run()
