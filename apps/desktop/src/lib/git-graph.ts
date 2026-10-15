import type { HermesGitCommit } from '@/global'

// Swimlane layout for the Source Control Graph — a port of VS Code's
// `toISCMHistoryItemViewModelArray` + `renderSCMHistoryItemGraph`
// (src/vs/workbench/contrib/scm/browser/scmHistory.ts). Each row carries the
// lanes flowing in from the row above and out to the row below; a lane's id is
// the sha it is waiting to reach. Geometry is plain data so it tests without a DOM.

export const GRAPH_ROW_HEIGHT = 22
export const GRAPH_LANE_WIDTH = 11
const CURVE_RADIUS = 5
const CIRCLE_RADIUS = 4
const CIRCLE_STROKE = 2

// VS Code's default scmGraph colors: current ref, its remote, the base ref,
// then the rotating lane palette.
export const GRAPH_REF_COLOR = 0
export const GRAPH_REMOTE_REF_COLOR = 1
export const GRAPH_BASE_REF_COLOR = 2

export const GRAPH_COLORS = [
  '#59a4f9',
  '#b180d7',
  '#ea5c00',
  '#ffb000',
  '#dc267f',
  '#994f00',
  '#40b0a6',
  '#b66dff'
] as const

const ROTATING_START = 3

export interface GraphLane {
  id: string
  color: number
}

export interface GraphRow {
  commit: HermesGitCommit
  input: GraphLane[]
  output: GraphLane[]
}

export interface GraphRefs {
  current?: null | string
  upstream?: null | string
  base?: null | string
}

function refColorMap(refs: GraphRefs): Map<string, number> {
  const map = new Map<string, number>()

  if (refs.base) {
    map.set(refs.base, GRAPH_BASE_REF_COLOR)
  }

  if (refs.upstream) {
    map.set(refs.upstream, GRAPH_REMOTE_REF_COLOR)
  }

  if (refs.current) {
    map.set(refs.current, GRAPH_REF_COLOR)
  }

  return map
}

function labelColor(commit: HermesGitCommit | undefined, colors: Map<string, number>): number | undefined {
  for (const ref of commit?.refs ?? []) {
    const color = colors.get(ref)

    if (color !== undefined) {
      return color
    }
  }

  return undefined
}

export function layoutGraph(commits: HermesGitCommit[], refs: GraphRefs = {}): GraphRow[] {
  const colors = refColorMap(refs)
  const bySha = new Map(commits.map(commit => [commit.sha, commit]))
  const rotating = GRAPH_COLORS.length - ROTATING_START
  let rotation = -1

  const nextColor = () => {
    rotation = (rotation + 1) % rotating

    return ROTATING_START + rotation
  }

  const rows: GraphRow[] = []

  for (const commit of commits) {
    const input = (rows.at(-1)?.output ?? []).map(lane => ({ ...lane }))
    const output: GraphLane[] = []
    let firstParentAdded = false

    for (const lane of input) {
      if (lane.id === commit.sha) {
        if (!firstParentAdded && commit.parents.length > 0) {
          output.push({ id: commit.parents[0], color: labelColor(commit, colors) ?? lane.color })
          firstParentAdded = true
        }

        continue
      }

      output.push({ ...lane })
    }

    for (let i = firstParentAdded ? 1 : 0; i < commit.parents.length; i++) {
      const color = labelColor(i === 0 ? commit : bySha.get(commit.parents[i]), colors) ?? nextColor()

      output.push({ id: commit.parents[i], color })
    }

    rows.push({ commit, input, output })
  }

  return rows
}

export interface GraphPath {
  d: string
  color: number
}

export interface GraphCircle {
  cx: number
  cy: number
  color: number
  kind: 'commit' | 'head' | 'merge'
}

export interface GraphRowShapes {
  width: number
  paths: GraphPath[]
  circle: GraphCircle
  // Concentric rings drawn for the circle, outermost first.
  rings: { r: number; fill: boolean; strokeWidth: number }[]
}

const x = (lane: number) => GRAPH_LANE_WIDTH * (lane + 1)
const MID = GRAPH_ROW_HEIGHT / 2

function vertical(lane: number, y1: number, y2: number, color: number): GraphPath {
  return { color, d: `M ${x(lane)} ${y1} V ${y2}` }
}

export function graphRowShapes(row: GraphRow, headSha: null | string): GraphRowShapes {
  const { commit, input, output } = row
  const W = GRAPH_LANE_WIDTH
  const inputIndex = input.findIndex(lane => lane.id === commit.sha)
  const circleIndex = inputIndex !== -1 ? inputIndex : input.length

  const circleColor =
    circleIndex < output.length
      ? output[circleIndex].color
      : circleIndex < input.length
        ? input[circleIndex].color
        : GRAPH_REF_COLOR

  const paths: GraphPath[] = []
  let outputIndex = 0

  for (let index = 0; index < input.length; index++) {
    const lane = input[index]

    if (lane.id === commit.sha) {
      if (index !== circleIndex) {
        // Another lane waiting on this commit bends into the circle.
        paths.push({
          color: lane.color,
          d: `M ${x(index)} 0 A ${W} ${W} 0 0 1 ${W * index} ${W} H ${x(circleIndex)}`
        })
      } else {
        outputIndex++
      }

      continue
    }

    if (outputIndex < output.length && lane.id === output[outputIndex].id) {
      if (index === outputIndex) {
        paths.push(vertical(index, 0, GRAPH_ROW_HEIGHT, lane.color))
      } else {
        // A lane shifting left after a lane above it closed.
        paths.push({
          color: lane.color,
          d: [
            `M ${x(index)} 0`,
            'V 6',
            `A ${CURVE_RADIUS} ${CURVE_RADIUS} 0 0 1 ${x(index) - CURVE_RADIUS} ${MID}`,
            `H ${x(outputIndex) + CURVE_RADIUS}`,
            `A ${CURVE_RADIUS} ${CURVE_RADIUS} 0 0 0 ${x(outputIndex)} ${MID + CURVE_RADIUS}`,
            `V ${GRAPH_ROW_HEIGHT}`
          ].join(' ')
        })
      }

      outputIndex++
    }
  }

  // Merge parents branch out of the circle into their own lanes.
  for (let i = 1; i < commit.parents.length; i++) {
    const parentIndex = output.findLastIndex(lane => lane.id === commit.parents[i])

    if (parentIndex === -1) {
      continue
    }

    paths.push({
      color: output[parentIndex].color,
      d: [
        `M ${W * parentIndex} ${MID}`,
        `A ${W} ${W} 0 0 1 ${x(parentIndex)} ${GRAPH_ROW_HEIGHT}`,
        `M ${W * parentIndex} ${MID}`,
        `H ${x(circleIndex)}`
      ].join(' ')
    })
  }

  if (inputIndex !== -1) {
    paths.push(vertical(circleIndex, 0, MID, input[inputIndex].color))
  }

  if (commit.parents.length > 0) {
    paths.push(vertical(circleIndex, MID, GRAPH_ROW_HEIGHT, circleColor))
  }

  const kind: GraphCircle['kind'] = commit.sha === headSha ? 'head' : commit.parents.length > 1 ? 'merge' : 'commit'

  const rings =
    kind === 'head'
      ? [
          { fill: false, r: CIRCLE_RADIUS + 3, strokeWidth: CIRCLE_STROKE },
          { fill: true, r: CIRCLE_STROKE, strokeWidth: 0 }
        ]
      : kind === 'merge'
        ? [
            { fill: false, r: CIRCLE_RADIUS, strokeWidth: CIRCLE_STROKE },
            { fill: true, r: CIRCLE_RADIUS - 2, strokeWidth: 0 }
          ]
        : [{ fill: true, r: CIRCLE_RADIUS + 1, strokeWidth: 0 }]

  return {
    width: W * (Math.max(input.length, output.length, 1) + 1),
    paths,
    circle: { color: circleColor, cx: x(circleIndex), cy: MID, kind },
    rings
  }
}
