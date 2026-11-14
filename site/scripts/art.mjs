// The site's artwork: line drawings, each made by a short Folio program, run here on Folio's own engine. What the
// turtle draws is kept stroke by stroke (art.json), so the site can draw each as the pen did: an opening's drawing
// as its page comes up, the front page's exhibition as it's scrolled to. Every one opens in the playground.
//
// Ink, orange and yellow are the site's (globals.css). The picture is 500 by 500, the turtle starting in the
// middle, facing up.
const INK = "#0c0c0b";
const LAMP = "#ff4d17";
const POP = "#f2c84b";

export const ART = [
  {
    name: "rosette", title: "Rosette", about: "36 circles, each turned 10 degrees from the last",
    code: `# a circle is 72 short steps; a rosette is 36 circles
pen color "${LAMP}"
pen width 1
repeat 36 times
    repeat 72 times
        move forward 9
        turn right 5
    end
    turn right 10
end`,
  },
  {
    name: "vortex", title: "Vortex", about: "A square that never quite closes",
    code: `# each side a little longer, each corner a degree short of square
pen color "${INK}"
pen width 1.4
set side to 2
repeat 165 times
    move forward side
    turn right 89
    add 2 to side
end`,
  },
  {
    name: "dragon", title: "Dragon", about: "A strip of paper folded in half 12 times",
    code: `# a function that calls itself twice, once each way
to dragon with size, depth, way
    if depth is 0
        move forward size
        return
    end
    turn right 45 * way
    dragon(size * 0.7071, depth - 1, 1)
    turn left 90 * way
    dragon(size * 0.7071, depth - 1, -1)
    turn right 45 * way
end
pen color "${INK}"
pen width 1.2
pen up
move to -124, 49
pen down
turn right 90
dragon(300, 12, 1)`,
  },
  {
    name: "bloom", title: "Bloom", about: "Petals of two arcs, three rings of them",
    code: `# a petal is two quarter turns, there and back
to petal with step
    repeat 2 times
        repeat 30 times
            move forward step
            turn right 3
        end
        turn right 90
    end
end
set colors to list of "${LAMP}", "${INK}", "${POP}"
set steps to list of 8.4, 5.6, 3
for each ring from 1 to 3
    pen color item ring of colors
    repeat 24 times
        petal(item ring of steps)
        turn right 15
    end
end`,
  },
  {
    name: "tree", title: "Tree", about: "Every branch is the tree again, smaller",
    code: `# a branch draws two smaller branches, and comes back
to branch with size
    if size is less than 5
        return
    end
    pen width size / 16
    move forward size
    turn left 24
    branch(size * 0.74)
    turn right 52
    branch(size * 0.67)
    turn left 28
    move back size
end
pen color "${INK}"
pen up
move to 22, -188
pen down
branch(112)`,
  },
  {
    name: "hilbert", title: "Hilbert", about: "One line that visits every square, and never crosses itself",
    code: `# four smaller copies of itself, joined by three steps
to hilbert with depth, angle
    if depth is 0
        return
    end
    turn right angle
    hilbert(depth - 1, -angle)
    move forward 14
    turn left angle
    hilbert(depth - 1, angle)
    move forward 14
    hilbert(depth - 1, angle)
    turn left angle
    move forward 14
    hilbert(depth - 1, -angle)
    turn right angle
end
pen color "${INK}"
pen width 1.6
pen up
move to -217, -217
pen down
hilbert(5, 90)`,
  },
  {
    name: "hexagons", title: "Hexagons", about: "44 hexagons, each smaller and turned a little",
    code: `# a hexagon's side is as long as it is from its middle to a corner
set reach to 240
pen width 1
repeat 44 times
    pen up
    move forward reach
    turn right 120
    pen down
    pen color "${LAMP}"
    repeat 6 times
        move forward reach
        turn right 60
    end
    pen up
    turn left 120
    move back reach
    turn right 7
    set reach to reach * 0.94
end`,
  },
  {
    name: "sunburst", title: "Sunburst", about: "120 rays, long and short by turns",
    code: `# out and back, 120 times round
pen color "${POP}"
pen width 1.6
set long to yes
repeat 120 times
    set reach to 150
    if long
        set reach to 240
    end
    pen up
    move forward 46
    pen down
    move forward reach - 46
    pen up
    move back reach
    turn right 3
    set long to not long
end`,
  },
  {
    name: "snowflake", title: "Snowflake", about: "Koch's: every line grows a point, four times over",
    code: `# a side is four smaller sides, with a point in the middle
to side with size, depth
    if depth is 0
        move forward size
        return
    end
    side(size / 3, depth - 1)
    turn left 60
    side(size / 3, depth - 1)
    turn right 120
    side(size / 3, depth - 1)
    turn left 60
    side(size / 3, depth - 1)
end
pen color "${LAMP}"
pen width 1.2
pen up
move to -195, -112
pen down
turn right 30
repeat 3 times
    side(390, 4)
    turn right 120
end`,
  },
];

// What each program draws, on the engine at `folio` (folio.js's address): its strokes joined into paths, a path
// for every run of the pen in one colour and width, in the order the pen drew them; and how long each is, so the
// site can draw them at the pen's pace. y goes down, as SVG has it.
export async function drawings(folio) {
  const { run } = await import(folio);
  const round = (n) => Math.round(n * 10) / 10;
  const short = (n) => String(round(n)).replace(/^(-?)0\./, "$1.");
  return ART.map((art) => {
    const strokes = [];
    run(art.code, () => {}, { draw: (segment) => strokes.push(segment), maxSteps: 5_000_000 });
    const paths = [];
    let last = null;
    for (const s of strokes) {
      if (s.x1 === undefined) continue; // not a line
      const [x1, y1, x2, y2] = [round(s.x1), round(-s.y1), round(s.x2), round(-s.y2)];
      const length = Math.hypot(x2 - x1, y2 - y1);
      const step = `l${short(x2 - x1)} ${short(y2 - y1)}`; // from where the pen is: shorter to write than where it goes
      if (last && last.c === s.color && last.w === s.width && last.x === x1 && last.y === y1) {
        last.d += step;
        last.n += length;
      } else {
        last = { d: `M${x1} ${y1}${step}`, c: s.color, w: s.width, n: length };
        paths.push(last);
      }
      last.x = x2;
      last.y = y2;
    }
    const xs = strokes.flatMap((s) => [s.x1, s.x2]);
    const ys = strokes.flatMap((s) => [-s.y1, -s.y2]);
    return {
      name: art.name, title: art.title, about: art.about, code: art.code, lines: art.code.split("\n").filter((l) => l.trim() && !l.trim().startsWith("#")).length,
      box: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(round),
      length: Math.round(paths.reduce((n, p) => n + p.n, 0)),
      paths: paths.map(({ d, c, w, n }) => ({ d, c, w, n: Math.round(n) })),
    };
  });
}
