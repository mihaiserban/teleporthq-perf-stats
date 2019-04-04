const { join } = require('path')
const fetch = require('node-fetch')
const pidUsage = require('pidusage')
const { promisify } = require('util')
const { writeFile: writeFileOrig } = require('fs')
const { exec: execSync, spawn } = require('child_process')

const execP = promisify(execSync)
const writeFile = promisify(writeFileOrig)
const exec = cmd => execP(cmd, { env: { ...process.env, GITHUB_TOKEN: '' } })

const MAIN_REPO = 'teleporthq/teleport-code-generators'
const GIT_ROOT = 'https://github.com/'

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
  const { stdout } = await exec('git tag --sort=-taggerdate')
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

run = async () => {
  const currentTag = await getCurrentTag()
  const tags = await getTags()

  console.log(`current tag: ${currentTag}`)
  console.log(`available tags: ${tags}`)

  for (let i = 0; i < tags.length; i++) {
    const tag = tags[i]
    const gitRef = await getTagRefString(tag)

    //checkout ref
    await exec(`mkdir ${tag}`)
    await checkoutRepo(MAIN_REPO, gitRef, tag)

    //build repo
    await buildRepo(tag)

    //get stats for each tag

    //cleanup
    await exec(`rm -rf ${tag}`)
  }
}

run()
