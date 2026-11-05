// The part of the WebAssembly engine's runtime written once, as text that both back ends assemble: wasm.js here,
// and wasm.folio through wasm-runtime.folio, which make-wasm-runtime.mjs writes from this file. So the two can't
// drift apart, and the module each makes stays the same, byte for byte.
//
// It is WebAssembly's own instructions, a function at a time:
//
//     memory NAME PAGES              the module's memory, of so many 64 KiB pages, exported under its name
//     double NAME VALUE              a number for f64.const NAME
//     global NAME TYPE mut|const ... a global, and the instructions that make its first value
//     text NAME "WORDS"              a global holding that text, which the module is made with
//     func NAME a:TYPE ... -> TYPE   a function, its inputs named, then what it gives (none, or one)
//     export NAME ...                the same, exported under its name for the JavaScript side
//     local NAME TYPE                a local, named
//
// and then the function's instructions, with `;;` starting a comment. A type is i32, i64, f64, eq (any Folio
// value), extern (a JavaScript value), ref:T or null:T (a reference to the module's type T: chars, text...).
// An instruction names a function as R.NAME, an import as im.NAME, a global as g.NAME, a type by its name, and
// a local or input by its name. A block, loop or if may be followed by its type: i32, i64, f64, eq or externref.
//
// What's here: text, which lives in the module as UTF-16, numbers as text, to 15 digits as the VM shows them,
// the mistake a variable with no value yet is, and dictionaries.

import { UNITS, MEASURES } from "./vm.js";

export const SOURCE = String.raw`
;; where text crosses to JavaScript and back, 32,768 units at a time
memory memory 1

;; ---------- doubles ----------
double d0 0
double d1 1
double d10 10
double dinf Infinity
double d2p53 9007199254740992

;; ---------- big whole numbers ----------
;; A big number is 32-bit limbs, lowest first, and how many are in use: at least 1, the top one not 0 unless
;; it's the only one. Six are made once, for working out a number's digits exactly (as machine.folio's are).
global bigR ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big
global bigS ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big
global bigMp ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big
global bigMm ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big
global bigT ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big
global bigU ref:big const i32.const 44 array.new_default ids i32.const 1 struct.new big

;; the digits of a number, as characters, and how many; where its point goes (it is 0.ddd times 10^dp)
global dbuf ref:chars const i32.const 40 array.new_default chars
global dn i32 mut i32.const 0
global dp i32 mut i32.const 0
;; a number's first 15 digits, rounded, as a whole number
global d15 i64 mut i64.const 0
;; a fraction below 1 times 2^120, in four limbs of 30 bits, highest first
global f0 i64 mut i64.const 0
global f1 i64 mut i64.const 0
global f2 i64 mut i64.const 0
global f3 i64 mut i64.const 0
;; a number's text as it's written, and how long it is so far
global nbuf ref:chars const i32.const 40 array.new_default chars
global nn i32 mut i32.const 0

;; b = v
func bigSet b:ref:big v:i64 ->
local a null:ids
local.get b struct.get big 0 local.set a
local.get a i32.const 0 local.get v i32.wrap_i64 array.set ids
local.get a i32.const 1 local.get v i64.const 32 i64.shr_u i32.wrap_i64 array.set ids
local.get b local.get v i64.const 32 i64.shr_u i64.eqz if i32 i32.const 1 else i32.const 2 end struct.set big 1

;; b = 2^k
func bigPow2 b:ref:big k:i32 ->
local a null:ids
local i i32
local q i32
local.get b struct.get big 0 local.set a
local.get k i32.const 5 i32.shr_u local.set q
block loop
  local.get i local.get q i32.ge_u br_if 1
  local.get a local.get i i32.const 0 array.set ids
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get a local.get q i32.const 1 local.get k i32.const 31 i32.and i32.shl array.set ids
local.get b local.get q i32.const 1 i32.add struct.set big 1

;; b times m, which is below 2^32
func bigMul b:ref:big m:i64 ->
local a null:ids
local n i32
local i i32
local c i64
local t i64
local.get b struct.get big 0 local.set a
local.get m i64.eqz if
  local.get a i32.const 0 i32.const 0 array.set ids
  local.get b i32.const 1 struct.set big 1
  return
end
local.get b struct.get big 1 local.set n
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get a local.get i array.get ids i64.extend_i32_u local.get m i64.mul local.get c i64.add local.set t
  local.get a local.get i local.get t i32.wrap_i64 array.set ids
  local.get t i64.const 32 i64.shr_u local.set c
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get c i64.eqz i32.eqz if
  local.get a local.get n local.get c i32.wrap_i64 array.set ids
  local.get b local.get n i32.const 1 i32.add struct.set big 1
end

;; b times 2^k
func bigShl b:ref:big k:i32 ->
block loop
  local.get k i32.eqz br_if 1
  local.get k i32.const 31 i32.gt_u if
    local.get b i64.const 2147483648 call R.bigMul
    local.get k i32.const 31 i32.sub local.set k
  else
    local.get b i64.const 1 local.get k i64.extend_i32_u i64.shl call R.bigMul
    i32.const 0 local.set k
  end
  br 0
end end

;; b times 10^k
func bigMulPow10 b:ref:big k:i32 ->
block loop
  local.get k i32.const 9 i32.lt_u br_if 1
  local.get b i64.const 1000000000 call R.bigMul
  local.get k i32.const 9 i32.sub local.set k
  br 0
end end
block loop
  local.get k i32.eqz br_if 1
  local.get b i64.const 10 call R.bigMul
  local.get k i32.const 1 i32.sub local.set k
  br 0
end end

;; x = y
func bigCopy x:ref:big y:ref:big ->
local.get x struct.get big 0 i32.const 0 local.get y struct.get big 0 i32.const 0 local.get y struct.get big 1 array.copy ids ids
local.get x local.get y struct.get big 1 struct.set big 1

;; x plus y
func bigAdd x:ref:big y:ref:big ->
local a null:ids
local n i32
local m i32
local i i32
local t i64
local c i64
local.get x struct.get big 0 local.set a
local.get x struct.get big 1 local.set n
local.get y struct.get big 1 local.set m
local.get m local.get n i32.gt_u if
  local.get n local.set i
  block loop
    local.get i local.get m i32.ge_u br_if 1
    local.get a local.get i i32.const 0 array.set ids
    local.get i i32.const 1 i32.add local.set i
    br 0
  end end
  local.get m local.set n
end
i32.const 0 local.set i
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get a local.get i array.get ids i64.extend_i32_u local.get c i64.add
  local.get i local.get m i32.lt_u if i64 local.get y struct.get big 0 local.get i array.get ids i64.extend_i32_u else i64.const 0 end
  i64.add local.set t
  local.get a local.get i local.get t i32.wrap_i64 array.set ids
  local.get t i64.const 32 i64.shr_u local.set c
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get c i64.eqz i32.eqz if
  local.get a local.get n local.get c i32.wrap_i64 array.set ids
  local.get n i32.const 1 i32.add local.set n
end
local.get x local.get n struct.set big 1

;; x less y, which is no bigger
func bigSub x:ref:big y:ref:big ->
local a null:ids
local n i32
local m i32
local i i32
local t i64
local borrow i64
local.get x struct.get big 0 local.set a
local.get x struct.get big 1 local.set n
local.get y struct.get big 1 local.set m
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get a local.get i array.get ids i64.extend_i32_u
  local.get i local.get m i32.lt_u if i64 local.get y struct.get big 0 local.get i array.get ids i64.extend_i32_u else i64.const 0 end
  i64.sub local.get borrow i64.sub local.set t
  local.get a local.get i local.get t i32.wrap_i64 array.set ids
  local.get t i64.const 63 i64.shr_u local.set borrow
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
block loop
  local.get n i32.const 1 i32.le_u br_if 1
  local.get a local.get n i32.const 1 i32.sub array.get ids br_if 1
  local.get n i32.const 1 i32.sub local.set n
  br 0
end end
local.get x local.get n struct.set big 1

;; x against y: -1, 0 or 1
func bigCmp x:ref:big y:ref:big -> i32
local n i32
local i i32
local p i32
local q i32
local.get x struct.get big 1 local.tee n local.get y struct.get big 1 i32.ne if
  local.get n local.get y struct.get big 1 i32.lt_u if i32 i32.const -1 else i32.const 1 end return
end
local.get n local.set i
block loop
  local.get i i32.eqz br_if 1
  local.get i i32.const 1 i32.sub local.set i
  local.get x struct.get big 0 local.get i array.get ids local.set p
  local.get y struct.get big 0 local.get i array.get ids local.set q
  local.get p local.get q i32.ne if
    local.get p local.get q i32.lt_u if i32 i32.const -1 else i32.const 1 end return
  end
  br 0
end end
i32.const 0

;; b times v, which is below 2^54
func bigMulU64 b:ref:big v:i64 ->
local hi i64
local.get v i64.const 32 i64.shr_u local.tee hi i64.eqz if
  local.get b local.get v call R.bigMul return
end
global.get g.bigU local.get b call R.bigCopy
local.get b local.get v i64.const 4294967295 i64.and call R.bigMul
global.get g.bigU local.get hi call R.bigMul
global.get g.bigU i32.const 32 call R.bigShl
local.get b global.get g.bigU call R.bigAdd

;; ---------- a number's digits ----------

;; the digits of a whole number v (at least 0) go in dbuf, and how many in dn
func intDigits v:i64 ->
local n i32
local w i64
local.get v local.set w
block loop
  local.get n i32.const 1 i32.add local.set n
  local.get w i64.const 10 i64.div_u local.tee w i64.eqz br_if 1
  br 0
end end
local.get n global.set g.dn
local.get v local.set w
block loop
  local.get n i32.const 1 i32.sub local.set n
  global.get g.dbuf local.get n local.get w i64.const 10 i64.rem_u i32.wrap_i64 i32.const 48 i32.add array.set chars
  local.get w i64.const 10 i64.div_u local.tee w i64.eqz br_if 1
  br 0
end end

;; bits b to b + 29 of m times 2^s
func limb30 m:i64 s:i32 b:i32 -> i64
local.get s local.get b i32.ge_s if i64
  local.get s local.get b i32.sub i32.const 30 i32.ge_u if i64
    i64.const 0
  else
    local.get m local.get s local.get b i32.sub i64.extend_i32_u i64.shl i64.const 1073741823 i64.and
  end
else
  local.get b local.get s i32.sub i32.const 53 i32.ge_u if i64
    i64.const 0
  else
    local.get m local.get b local.get s i32.sub i64.extend_i32_u i64.shr_u i64.const 1073741823 i64.and
  end
end

;; the next digit of the fraction in f0 to f3, which keep the rest
func fracDigit -> i32
local t i64
global.get g.f3 i64.const 10 i64.mul local.set t
local.get t i64.const 1073741823 i64.and global.set g.f3
global.get g.f2 i64.const 10 i64.mul local.get t i64.const 30 i64.shr_u i64.add local.set t
local.get t i64.const 1073741823 i64.and global.set g.f2
global.get g.f1 i64.const 10 i64.mul local.get t i64.const 30 i64.shr_u i64.add local.set t
local.get t i64.const 1073741823 i64.and global.set g.f1
global.get g.f0 i64.const 10 i64.mul local.get t i64.const 30 i64.shr_u i64.add local.set t
local.get t i64.const 1073741823 i64.and global.set g.f0
local.get t i64.const 30 i64.shr_u i32.wrap_i64

;; d15 rounded by its 16th digit, half up, as toPrecision rounds
func round15 d:i32 ->
local.get d i32.const 5 i32.ge_u if
  global.get g.d15 i64.const 1 i64.add global.set g.d15
  global.get g.d15 i64.const 1000000000000000 i64.eq if
    i64.const 100000000000000 global.set g.d15
    global.get g.dp i32.const 1 i32.add global.set g.dp
  end
end

;; x, a number above 0 that isn't whole: its first 15 significant digits, rounded, in d15, and where the
;; point goes in dp. The whole part's digits come from it; the fraction's, from it times 2^120, exactly.
func dec15 x:f64 ->
local bits i64
local w i64
local m i64
local s i32
local k i32
local left i32
local d i64
local t i64
local.get x i64.reinterpret_f64 i64.const 52 i64.shr_u i32.wrap_i64 i32.const 955 i32.lt_u if
  local.get x call R.dec15Tiny return
end
local.get x i64.trunc_f64_u local.set w
local.get x local.get w f64.convert_i64_u f64.sub i64.reinterpret_f64 local.set bits
local.get bits i64.const 4503599627370495 i64.and i64.const 4503599627370496 i64.or local.set m
local.get bits i64.const 52 i64.shr_u i32.wrap_i64 i32.const 955 i32.sub local.set s
local.get m local.get s i32.const 90 call R.limb30 global.set g.f0
local.get m local.get s i32.const 60 call R.limb30 global.set g.f1
local.get m local.get s i32.const 30 call R.limb30 global.set g.f2
local.get m local.get s i32.const 0 call R.limb30 global.set g.f3
local.get w i64.eqz if
  block loop
    call R.fracDigit local.tee left br_if 1
    local.get k i32.const 1 i32.sub local.set k
    br 0
  end end
  local.get left i64.extend_i32_u local.set d
  i32.const 14 local.set left
else
  local.get w local.set t
  block loop
    local.get k i32.const 1 i32.add local.set k
    local.get t i64.const 10 i64.div_u local.tee t i64.eqz br_if 1
    br 0
  end end
  local.get k i32.const 16 i32.ge_u if
    local.get w i64.const 10 i64.div_u global.set g.d15
    local.get k global.set g.dp
    local.get w i64.const 10 i64.rem_u i32.wrap_i64 call R.round15
    return
  end
  local.get w local.set d
  i32.const 15 local.get k i32.sub local.set left
end
block loop
  local.get left i32.eqz br_if 1
  local.get d i64.const 10 i64.mul call R.fracDigit i64.extend_i32_u i64.add local.set d
  local.get left i32.const 1 i32.sub local.set left
  br 0
end end
local.get d global.set g.d15
local.get k global.set g.dp
call R.fracDigit call R.round15

;; the same for a number below 2^-68, with big whole numbers: x is R / S, and each digit is how many times S
;; goes into R
func dec15Tiny x:f64 ->
local bits i64
local be i32
local m i64
local q i32
local p i32
local d i32
local i i32
local.get x i64.reinterpret_f64 local.tee bits i64.const 52 i64.shr_u i32.wrap_i64 local.set be
local.get bits i64.const 4503599627370495 i64.and local.set m
local.get be if
  local.get m i64.const 4503599627370496 i64.or local.set m
  i32.const 1075 local.get be i32.sub local.set q
else
  i32.const 1074 local.set q
end
global.get g.bigR local.get m call R.bigSet
global.get g.bigS local.get q call R.bigPow2
i32.const 1 local.set p
block loop
  global.get g.bigR global.get g.bigS call R.bigCmp i32.const 0 i32.ge_s br_if 1
  global.get g.bigR i64.const 10 call R.bigMul
  local.get p i32.const 1 i32.sub local.set p
  br 0
end end
i64.const 0 global.set g.d15
block loop
  i32.const 0 local.set d
  block loop
    global.get g.bigR global.get g.bigS call R.bigCmp i32.const 0 i32.lt_s br_if 1
    global.get g.bigR global.get g.bigS call R.bigSub
    local.get d i32.const 1 i32.add local.set d
    br 0
  end end
  local.get i i32.const 15 i32.eq br_if 1
  global.get g.d15 i64.const 10 i64.mul local.get d i64.extend_i32_u i64.add global.set g.d15
  global.get g.bigR i64.const 10 call R.bigMul
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get p global.set g.dp
local.get d call R.round15

;; 10^k, for k from 0 to 22, which a double holds exactly
func pow10 k:i32 -> f64
local v f64
f64.const d1 local.set v
block loop
  local.get k i32.eqz br_if 1
  local.get v f64.const d10 f64.mul local.set v
  local.get k i32.const 1 i32.sub local.set k
  br 0
end end
local.get v

;; S times (2f + side), against R
func timesOdd f:i64 side:i64 -> i32
global.get g.bigT global.get g.bigS call R.bigCopy
global.get g.bigT local.get f i64.const 1 i64.shl local.get side i64.add call R.bigMulU64
global.get g.bigT global.get g.bigR call R.bigCmp

;; x, a number above 0 that isn't whole: the double nearest its value to 15 digits, D times 10^p, as canon in
;; vm.js. With p from -22 up, D and 10^-p are both exact, so one multiplication or division rounds it right.
;; Below that, it is f times 2^e for the f closest to D times 2^-e over 10^-p, worked out with big whole
;; numbers at the scale of x itself, or the one next to it if f leaves it.
func canon x:f64 -> f64
local p i32
local f i64
local e i32
local be i32
local c i32
local.get x call R.dec15
global.get g.dp i32.const 15 i32.sub local.tee p i32.const -22 i32.ge_s if
  local.get p i32.const 0 i32.ge_s if f64
    global.get g.d15 f64.convert_i64_u local.get p call R.pow10 f64.mul
  else
    global.get g.d15 f64.convert_i64_u i32.const 0 local.get p i32.sub call R.pow10 f64.div
  end
  return
end
global.get g.bigS i64.const 1 call R.bigSet
global.get g.bigS i32.const 0 local.get p i32.sub call R.bigMulPow10
local.get x i64.reinterpret_f64 i64.const 52 i64.shr_u i32.wrap_i64 local.set be
local.get x i64.reinterpret_f64 i64.const 4503599627370495 i64.and local.set f
local.get be if
  local.get f i64.const 4503599627370496 i64.or local.set f
  local.get be i32.const 1075 i32.sub local.set e
else
  i32.const -1074 local.set e
end
loop
  ;; R: D times 2^(1 - e)
  global.get g.bigR global.get g.d15 call R.bigSet
  global.get g.bigR i32.const 1 local.get e i32.sub call R.bigShl
  ;; up while the value is past f + 1/2
  block loop
    local.get f i64.const 1 call R.timesOdd local.tee c i32.const 0 i32.ge_s br_if 1
    local.get f i64.const 1 i64.add local.set f
    br 0
  end end
  local.get c i32.eqz if
    ;; halfway: to the even one
    local.get f i64.const 1 i64.and i64.eqz i32.eqz if local.get f i64.const 1 i64.add local.set f end
  else
    ;; down while it's short of f - 1/2
    block loop
      local.get f i64.eqz br_if 1
      local.get f i64.const -1 call R.timesOdd local.tee c i32.const 0 i32.lt_s br_if 1
      local.get c i32.eqz local.get f i64.const 1 i64.and i64.eqz i32.and br_if 1
      local.get f i64.const 1 i64.sub local.set f
      br 0
    end end
  end
  ;; f out of its 53 bits: the scale next to it
  local.get f i64.const 9007199254740992 i64.ge_u if
    local.get f i64.const 1 i64.shr_u local.set f
    local.get e i32.const 1 i32.add local.set e
    br 1
  end
  local.get f i64.const 4503599627370496 i64.lt_u local.get e i32.const -1074 i32.gt_s i32.and if
    local.get f i64.const 1 i64.shl local.set f
    local.get e i32.const 1 i32.sub local.set e
    br 1
  end
end
local.get f i64.const 4503599627370496 i64.lt_u if f64
  local.get f f64.reinterpret_i64
else
  local.get f i64.const 4503599627370496 i64.sub local.get e i32.const 1075 i32.add i64.extend_i32_u i64.const 52 i64.shl i64.or f64.reinterpret_i64
end

;; R + M+ against S
func high -> i32
global.get g.bigT global.get g.bigR call R.bigCopy
global.get g.bigT global.get g.bigMp call R.bigAdd
global.get g.bigT global.get g.bigS call R.bigCmp

;; ten times R + M+ against S
func highTen -> i32
global.get g.bigT global.get g.bigR call R.bigCopy
global.get g.bigT global.get g.bigMp call R.bigAdd
global.get g.bigT i64.const 10 call R.bigMul
global.get g.bigT global.get g.bigS call R.bigCmp

;; x, a number above 0: dbuf gets the fewest digits that read back as it, dn how many, dp where the point
;; goes. The number is R / S, and M+ and M- are how far each way a number can be and still read back as it,
;; all doubled so they're whole (Steele and White's way, as machine.folio's rt_shortest).
func shortest x:f64 ->
local bits i64
local frac i64
local f i64
local e i32
local even i32
local be i32
local k i32
local n i32
local d i32
local low i32
local high i32
local c i32
local.get x i64.reinterpret_f64 local.tee bits i64.const 4503599627370495 i64.and local.tee frac local.set f
local.get bits i64.const 52 i64.shr_u i32.wrap_i64 local.tee be if
  local.get f i64.const 4503599627370496 i64.or local.set f
else
  i32.const 1 local.set be
end
local.get be i32.const 1075 i32.sub local.set e
local.get f i32.wrap_i64 i32.const 1 i32.and i32.eqz local.set even
local.get e i32.const 0 i32.ge_s if
  local.get frac i64.eqz if
    ;; a power of two: the next number down is closer than the next one up
    global.get g.bigR local.get e i32.const 2 i32.add call R.bigPow2
    global.get g.bigR local.get f call R.bigMulU64
    global.get g.bigS i64.const 4 call R.bigSet
    global.get g.bigMp local.get e i32.const 1 i32.add call R.bigPow2
    global.get g.bigMm local.get e call R.bigPow2
  else
    global.get g.bigR local.get e i32.const 1 i32.add call R.bigPow2
    global.get g.bigR local.get f call R.bigMulU64
    global.get g.bigS i64.const 2 call R.bigSet
    global.get g.bigMp local.get e call R.bigPow2
    global.get g.bigMm local.get e call R.bigPow2
  end
else
  ;; R = 2f and S = 2^(1 - e), or twice both for a power of two
  i32.const 1 local.set c
  local.get e i32.const -1074 i32.ne local.get frac i64.eqz i32.and if i32.const 2 local.set c end
  global.get g.bigR local.get f call R.bigSet
  global.get g.bigR local.get c i64.extend_i32_u i64.const 1 i64.shl call R.bigMul
  global.get g.bigS local.get c local.get e i32.sub call R.bigPow2
  global.get g.bigMp local.get c i64.extend_i32_u call R.bigSet
  global.get g.bigMm i64.const 1 call R.bigSet
end
;; R, M+ and M- times 10 while ten times R + M+ is short of S
block loop
  call R.highTen local.tee c i32.const 0 i32.gt_s br_if 1
  local.get c i32.eqz local.get even i32.and br_if 1
  global.get g.bigR i64.const 10 call R.bigMul
  global.get g.bigMp i64.const 10 call R.bigMul
  global.get g.bigMm i64.const 10 call R.bigMul
  local.get k i32.const 1 i32.sub local.set k
  br 0
end end
;; S times 10 while R + M+ reaches it
block loop
  call R.high local.tee c i32.const 0 i32.lt_s br_if 1
  local.get c i32.eqz local.get even i32.eqz i32.and br_if 1
  global.get g.bigS i64.const 10 call R.bigMul
  local.get k i32.const 1 i32.add local.set k
  br 0
end end
block loop
  global.get g.bigR i64.const 10 call R.bigMul
  global.get g.bigMp i64.const 10 call R.bigMul
  global.get g.bigMm i64.const 10 call R.bigMul
  i32.const 0 local.set d
  block loop
    global.get g.bigR global.get g.bigS call R.bigCmp i32.const 0 i32.lt_s br_if 1
    global.get g.bigR global.get g.bigS call R.bigSub
    local.get d i32.const 1 i32.add local.set d
    br 0
  end end
  ;; low: R is within M- of 0; high: R + M+ reaches S (each counting halfway when f is even)
  global.get g.bigR global.get g.bigMm call R.bigCmp local.tee c i32.const 0 i32.lt_s
  local.get c i32.eqz local.get even i32.and i32.or local.set low
  call R.high local.tee c i32.const 0 i32.gt_s
  local.get c i32.eqz local.get even i32.and i32.or local.set high
  local.get low local.get high i32.or br_if 1
  global.get g.dbuf local.get n local.get d i32.const 48 i32.add array.set chars
  local.get n i32.const 1 i32.add local.set n
  br 0
end end
local.get low if
  local.get high if
    ;; both: the digit nearer x, and the even one at a tie
    global.get g.bigT global.get g.bigR call R.bigCopy
    global.get g.bigT global.get g.bigR call R.bigAdd
    global.get g.bigT global.get g.bigS call R.bigCmp local.tee c i32.const 0 i32.gt_s
    local.get c i32.eqz local.get d i32.const 1 i32.and i32.and i32.or if
      local.get d i32.const 1 i32.add local.set d
    end
  end
else
  local.get d i32.const 1 i32.add local.set d
end
global.get g.dbuf local.get n local.get d i32.const 48 i32.add array.set chars
local.get n i32.const 1 i32.add global.set g.dn
local.get k global.set g.dp

;; ---------- a number as text ----------

;; c at the end of the number's text
func nput c:i32 ->
global.get g.nbuf global.get g.nn local.get c array.set chars
global.get g.nn i32.const 1 i32.add global.set g.nn

;; the digits from place 'from' to 'to' (not counting it), at the end of the number's text
func nputDigits from:i32 to:i32 ->
block loop
  local.get from local.get to i32.ge_s br_if 1
  global.get g.dbuf local.get from array.get_u chars call R.nput
  local.get from i32.const 1 i32.add local.set from
  br 0
end end

;; the dn digits in dbuf, with the point dp digits in, as JavaScript lays them out
func layout ->
local k i32
local n i32
global.get g.dp local.set k
global.get g.dn local.set n
local.get k local.get n i32.ge_s if
  local.get k i32.const 21 i32.le_s if
    ;; 1200: the digits, then zeros
    i32.const 0 local.get n call R.nputDigits
    block loop
      local.get n local.get k i32.ge_s br_if 1
      i32.const 48 call R.nput
      local.get n i32.const 1 i32.add local.set n
      br 0
    end end
    return
  end
else
  local.get k i32.const 0 i32.gt_s if
    ;; 12.5: some digits, a point, the rest
    i32.const 0 local.get k call R.nputDigits
    i32.const 46 call R.nput
    local.get k local.get n call R.nputDigits
    return
  end
  local.get k i32.const -6 i32.gt_s if
    ;; 0.005: a point, zeros, the digits
    i32.const 48 call R.nput
    i32.const 46 call R.nput
    block loop
      local.get k i32.eqz br_if 1
      i32.const 48 call R.nput
      local.get k i32.const 1 i32.add local.set k
      br 0
    end end
    i32.const 0 local.get n call R.nputDigits
    return
  end
end
;; 1.5e+21: a digit, maybe a point and the rest, e and the power of ten
i32.const 0 i32.const 1 call R.nputDigits
local.get n i32.const 1 i32.gt_s if
  i32.const 46 call R.nput
  i32.const 1 local.get n call R.nputDigits
end
i32.const 101 call R.nput
local.get k i32.const 1 i32.sub local.tee k i32.const 0 i32.lt_s if
  i32.const 45 call R.nput
  i32.const 0 local.get k i32.sub local.set k
else
  i32.const 43 call R.nput
end
local.get k i64.extend_i32_u call R.intDigits
i32.const 0 global.get g.dn call R.nputDigits

;; the number's text, made
func nmade -> eq
local a null:chars
global.get g.nn array.new_default chars local.tee a
i32.const 0 global.get g.nbuf i32.const 0 global.get g.nn array.copy chars chars
local.get a global.get g.nn call R.newText

;; x as text, as the VM shows a number: to 15 digits, laid out as JavaScript lays numbers out
func numText x:f64 -> eq
i32.const 0 global.set g.nn
local.get x local.get x f64.ne if
  i32.const 78 call R.nput i32.const 97 call R.nput i32.const 78 call R.nput
  call R.nmade return
end
local.get x f64.const d0 f64.eq if
  i32.const 48 call R.nput
  call R.nmade return
end
local.get x f64.const d0 f64.lt if
  i32.const 45 call R.nput
  local.get x f64.neg local.set x
end
local.get x f64.const dinf f64.eq if
  i32.const 73 call R.nput i32.const 110 call R.nput i32.const 102 call R.nput i32.const 105 call R.nput
  i32.const 110 call R.nput i32.const 105 call R.nput i32.const 116 call R.nput i32.const 121 call R.nput
  call R.nmade return
end
local.get x f64.const d2p53 f64.ge if
  ;; whole, and past what a double counts by 1: the fewest digits that read back as it
  local.get x call R.shortest call R.layout
  call R.nmade return
end
local.get x local.get x f64.trunc f64.eq if
  local.get x i64.trunc_f64_u call R.intDigits
  global.get g.dn global.set g.dp
  call R.layout
  call R.nmade return
end
local.get x i64.reinterpret_f64 i64.const 52 i64.shr_u i32.wrap_i64 i32.const 1 i32.le_u if
  ;; so small that 15 digits don't read back as one double each: the double they read back as, shortest
  local.get x call R.canon call R.shortest call R.layout
  call R.nmade return
end
local.get x call R.dec15
global.get g.d15 call R.intDigits
;; less the zeros at the end
block loop
  global.get g.dn i32.const 1 i32.le_u br_if 1
  global.get g.dbuf global.get g.dn i32.const 1 i32.sub array.get_u chars i32.const 48 i32.ne br_if 1
  global.get g.dn i32.const 1 i32.sub global.set g.dn
  br 0
end end
call R.layout
call R.nmade

export numberText x:f64 -> eq
local.get x call R.numText

;; ---------- mistakes ----------
;; A variable with no value yet: the mistake the other engines make, thrown at position k (DESIGN §146). The
;; variable's name is n units from byte 'at' of the program's data, which every module has, and the mistake's words
;; are made here, when it happens, so a program doesn't make them for every variable it has.
text noValue1 "'"
text noValue2 "' has no value yet (give it one with 'set "
text noValue3 " to ...')"
func noValueYet at:i32 n:i32 k:i32 ->
local name eq
local.get at local.get n array.new_data chars 0 local.get n call R.newText local.set name
global.get g.noValue1 local.get name call R.concat global.get g.noValue2 call R.concat local.get name call R.concat
global.get g.noValue3 call R.concat i32.const 0 local.get k throw 0

;; ---------- dictionaries ----------
;; A dictionary keeps its keys and values in two lists, in the order the keys were first set, and finds a key
;; by its hash in slots: each the place of an entry plus 1, or 0 for none, as many as a power of 2 at least
;; twice the places used. A key taken out leaves nothing in its place, which finding passes over, until the
;; dictionary is made again without them. Keys are text, or numbers to 15 digits (vm.js's canon) with -0 as 0,
;; as a JavaScript Map of them has them (DESIGN §147).

;; a new dictionary, with nothing in it
func dictNew -> ref:dict
i32.const 8 array.new_default items i32.const 8 array.new_default items i32.const 0 i32.const 0
i32.const 16 array.new_default ids struct.new dict

;; 1 if v is a number: an i31 that isn't 0 or 1 (no and yes), or a box
func isNumber v:eq -> i32
local.get v ref.test i31 if i32
  local.get v ref.cast i31 i31.get_u i32.const 2 i32.ge_u
else
  local.get v ref.test num
end

;; v's number
func numberOf v:eq -> f64
local.get v ref.test i31 if f64
  local.get v ref.cast i31 i31.get_s f64.convert_i32_s
else
  local.get v ref.cast num struct.get num 0
end

;; key k as a dictionary keeps it: text as it is, a number as vm.js's canon has it (a whole number, or one that
;; isn't finite, as it is; any other to 15 digits), -0 as 0 (k is text or a number)
func dictKey k:eq -> eq
local x f64
local.get k ref.test i31 if
  local.get k return
end
local.get k ref.test num if
  local.get k ref.cast num struct.get num 0 local.tee x local.get x f64.trunc f64.eq
  local.get x local.get x f64.sub local.get x local.get x f64.sub f64.ne i32.or if
    local.get x f64.const d0 f64.add call R.box return
  end
  local.get x f64.abs call R.canon local.get x f64.copysign call R.box return
end
local.get k

;; a key's hash (k as dictKey keeps it): text by its units (FNV-1a), a number by its value's bits, every NaN the
;; same. A whole number an i31 holds is kept as one, never as a box, so it can be hashed by its value.
func keyHash k:eq -> i32
local h i32
local u null:chars
local n i32
local i i32
local x f64
local b i64
local.get k ref.test i31 if
  local.get k ref.cast i31 i31.get_s i32.const -1640531535 i32.mul return
end
local.get k ref.test text if
  local.get k call R.units local.set u
  local.get k ref.cast text struct.get text 1 local.set n
  i32.const -2128831035 local.set h
  block loop
    local.get i local.get n i32.ge_u br_if 1
    local.get h local.get u local.get i array.get_u chars i32.xor i32.const 16777619 i32.mul local.set h
    local.get i i32.const 1 i32.add local.set i
    br 0
  end end
  local.get h return
end
local.get k call R.numberOf local.tee x local.get x f64.ne if
  i32.const 7 return
end
local.get x i64.reinterpret_f64 local.tee b local.get b i64.const 32 i64.shr_u i64.xor i32.wrap_i64 i32.const -1640531535 i32.mul

;; 1 if two keys are the same: text by its units, numbers by their value, NaN as NaN; nothing (a key taken out) is no key's
func keySame a:eq b:eq -> i32
local x f64
local y f64
local.get a local.get b ref.eq if
  local.get a ref.is_null i32.eqz return
end
local.get a ref.test i31 local.get b ref.test i31 i32.and if
  i32.const 0 return
end
local.get a ref.test text local.get b ref.test text i32.and if
  local.get a local.get b call R.sameText return
end
local.get a call R.isNumber local.get b call R.isNumber i32.and if
  local.get a call R.numberOf local.tee x local.get b call R.numberOf local.tee y f64.eq
  local.get x local.get x f64.ne local.get y local.get y f64.ne i32.and i32.or return
end
i32.const 0

;; the place of key k (as dictKey keeps it, with hash h) in d, or -1
func dictFind d:null:dict k:eq h:i32 -> i32
local slots null:ids
local mask i32
local s i32
local e i32
local.get d struct.get dict 4 local.tee slots array.len i32.const 1 i32.sub local.set mask
local.get h local.get mask i32.and local.set s
block loop
  local.get slots local.get s array.get ids local.tee e i32.eqz br_if 1
  local.get d struct.get dict 0 local.get e i32.const 1 i32.sub array.get items local.get k call R.keySame if
    local.get e i32.const 1 i32.sub return
  end
  local.get s i32.const 1 i32.add local.get mask i32.and local.set s
  br 0
end end
i32.const -1

;; entry e (its place plus 1) in d's first empty slot from hash h on
func dictSlot d:null:dict h:i32 e:i32 ->
local slots null:ids
local mask i32
local s i32
local.get d struct.get dict 4 local.tee slots array.len i32.const 1 i32.sub local.set mask
local.get h local.get mask i32.and local.set s
block loop
  local.get slots local.get s array.get ids i32.eqz br_if 1
  local.get s i32.const 1 i32.add local.get mask i32.and local.set s
  br 0
end end
local.get slots local.get s local.get e array.set ids

;; d made again, with room for twice the keys it has (8 at least), and no places of keys taken out
func dictRemake d:null:dict ->
local keys null:items
local values null:items
local nk null:items
local nv null:items
local cap i32
local size i32
local used i32
local i i32
local n i32
local k eq
local.get d struct.get dict 0 local.set keys
local.get d struct.get dict 1 local.set values
local.get d struct.get dict 2 local.set used
local.get d struct.get dict 3 i32.const 1 i32.shl local.tee cap i32.const 8 i32.lt_u if
  i32.const 8 local.set cap
end
i32.const 16 local.set size
block loop
  local.get size local.get cap i32.const 1 i32.shl i32.ge_u br_if 1
  local.get size i32.const 1 i32.shl local.set size
  br 0
end end
local.get cap array.new_default items local.set nk
local.get cap array.new_default items local.set nv
local.get d local.get nk ref.as_non_null struct.set dict 0
local.get d local.get nv ref.as_non_null struct.set dict 1
local.get d local.get size array.new_default ids struct.set dict 4
block loop
  local.get i local.get used i32.ge_u br_if 1
  local.get keys local.get i array.get items local.tee k ref.is_null i32.eqz if
    local.get nk local.get n local.get k array.set items
    local.get nv local.get n local.get values local.get i array.get items array.set items
    local.get n i32.const 1 i32.add local.set n
    local.get d local.get k call R.keyHash local.get n call R.dictSlot
  end
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get d local.get n struct.set dict 2

;; value v for key k (as dictKey keeps it) in d: in its place if it's there, after the rest if not
func dictSet d:null:dict k:eq v:eq ->
local h i32
local e i32
local n i32
local.get k call R.keyHash local.set h
local.get d local.get k local.get h call R.dictFind local.tee e i32.const 0 i32.ge_s if
  local.get d struct.get dict 1 local.get e local.get v array.set items return
end
local.get d struct.get dict 2 local.tee n local.get d struct.get dict 0 array.len i32.eq
local.get n i32.const 1 i32.add i32.const 1 i32.shl local.get d struct.get dict 4 array.len i32.gt_u i32.or if
  local.get d call R.dictRemake
  local.get d struct.get dict 2 local.set n
end
local.get d struct.get dict 0 local.get n local.get k array.set items
local.get d struct.get dict 1 local.get n local.get v array.set items
local.get d local.get n i32.const 1 i32.add struct.set dict 2
local.get d local.get d struct.get dict 3 i32.const 1 i32.add struct.set dict 3
local.get d local.get h local.get n i32.const 1 i32.add call R.dictSlot

;; 'item key of d', key text or a number: its value, or the mistake
func dictItem d:eq key:eq k:i32 -> eq
local dd null:dict
local kk eq
local e i32
local.get d ref.cast dict local.tee dd local.get key call R.dictKey local.tee kk local.get kk call R.keyHash call R.dictFind local.tee e i32.const 0 i32.ge_s if
  local.get dd struct.get dict 1 local.get e array.get items return
end
local.get d local.get key local.get k call R.itemRest

;; 1 if key, text or a number, is in d
func dictHas d:eq key:eq -> i32
local kk eq
local.get d ref.cast dict local.get key call R.dictKey local.tee kk local.get kk call R.keyHash call R.dictFind i32.const 0 i32.ge_s

;; 'remove key from target': a key of a dictionary taken out here; anything else, and every mistake, in removeRest
func remove key:eq target:eq k:i32 ->
local dd null:dict
local kk eq
local e i32
local.get target ref.test dict local.get key ref.test text local.get key call R.isNumber i32.or i32.and if
  local.get target ref.cast dict local.tee dd local.get key call R.dictKey local.tee kk local.get kk call R.keyHash call R.dictFind local.tee e i32.const 0 i32.ge_s if
    local.get dd struct.get dict 0 local.get e ref.null eq array.set items
    local.get dd struct.get dict 1 local.get e ref.null eq array.set items
    local.get dd local.get dd struct.get dict 3 i32.const 1 i32.sub struct.set dict 3
    return
  end
end
local.get key local.get target local.get k call R.removeRest

;; 'dictionary where ...': from a list of each key and then its value; a key that isn't text or a number is a
;; mistake
func dictOf l:eq k:i32 -> eq
local d null:dict
local items null:items
local n i32
local i i32
local key eq
local.get l ref.cast list struct.get list 0 local.set items
local.get l ref.cast list struct.get list 1 local.set n
call R.dictNew local.set d
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get items local.get i array.get items local.tee key ref.test text local.get key call R.isNumber i32.or i32.eqz if
    local.get key local.get k call R.keyKind
  end
  local.get d local.get key call R.dictKey local.get items local.get i i32.const 1 i32.add array.get items call R.dictSet
  local.get i i32.const 2 i32.add local.set i
  br 0
end end
local.get d

;; for JavaScript: a new dictionary; a key (text or a number) and its value put in one; how many places it has
;; used, and the key and value in each (nothing for a key taken out)
export makeDict -> eq
call R.dictNew

export dictPut d:eq key:eq v:eq ->
local.get d ref.cast dict local.get key call R.dictKey local.get v call R.dictSet

export dictUsed d:eq -> i32
local.get d ref.cast dict struct.get dict 2

export dictKeyAt d:eq i:i32 -> eq
local.get d ref.cast dict struct.get dict 0 local.get i array.get items

export dictValueAt d:eq i:i32 -> eq
local.get d ref.cast dict struct.get dict 1 local.get i array.get items

;; ---------- the words of a mistake: what a value is, and the program's names (DESIGN §151) ----------
;; What vm.js's kindOf says a value is, and each unit's measure (vm.js's UNITS), by the unit's number
text kindNothing "nothing"
text kindYesNo "yes/no"
text kindText "text"
text kindList "a list"
text kindFunction "a function"
text kindRecord "a record"
text kindDictionary "a dictionary"
text kindBytes "bytes"
text kindNumber "a number"
${MEASURES.map((m, i) => `text measure${i} ${JSON.stringify(m)}`).join("\n")}
global unitMeasure ref:ids const ${UNITS.map((u) => `i32.const ${u[2]}`).join(" ")} array.new_fixed ids ${UNITS.length}
;; the program's names, as places in its data: for each, where its units start and how many there are (init
;; makes this, from what the compiler put in the data last)
global names null:ids mut ref.null ids
;; the pieces of the mistakes' words
text quoted "'"
text noFunction "there is no function called '"
text isA "' is "
text notAFunction ", not a function"
text needs "' needs "
text inputWord " input"
text pluralS "s"
text butGot " but got "
text rangeWords "'from' and 'to' need numbers, not "
text andWords " and "
text canOnlyChange "can only change '"
text ofARecordNot "' of a record, not "
text cantTake "can't take '"
text ofWords "' of "

;; what a value is, in words, as kindOf in vm.js says it
func kindWords v:eq -> eq
local.get v ref.is_null if
  global.get g.kindNothing return
end
local.get v ref.test i31 if
  local.get v ref.cast i31 i31.get_u i32.const 2 i32.lt_u if
    global.get g.kindYesNo return
  end
  global.get g.kindNumber return
end
local.get v ref.test text if
  global.get g.kindText return
end
local.get v ref.test list if
  global.get g.kindList return
end
local.get v ref.test closure if
  global.get g.kindFunction return
end
local.get v ref.test record if
  global.get g.kindRecord return
end
local.get v ref.test dict if
  global.get g.kindDictionary return
end
local.get v ref.test bytes if
  global.get g.kindBytes return
end
local.get v ref.test qty if
  ${MEASURES.map((_, i) => `global.get g.unitMeasure local.get v ref.cast qty struct.get qty 1 array.get ids i32.const ${i} i32.eq if\n    global.get g.measure${i} return\n  end`).join("\n  ")}
end
global.get g.kindNumber

;; name number id as text, from the program's data
func nameText id:i32 -> eq
local at i32
local n i32
local base i32
global.get g.names array.len i32.const 1 i32.shr_u local.set base
local.get id local.get base i32.ge_u if
  global.get g.moreNames local.get id local.get base i32.sub array.get items return
end
global.get g.names local.get id i32.const 1 i32.shl array.get ids local.set at
global.get g.names local.get id i32.const 1 i32.shl i32.const 1 i32.add array.get ids local.set n
local.get at local.get n array.new_data chars 0 local.get n call R.newText

;; A call of name id, at position k, that can't be made: there's no function called that, or it's something else
func callable f:eq name:i32 k:i32 ->
local.get f ref.test unset if
  global.get g.noFunction local.get name call R.nameText call R.concat global.get g.quoted call R.concat i32.const 0 local.get k throw 0
end
global.get g.quoted local.get name call R.nameText call R.concat global.get g.isA call R.concat local.get f call R.kindWords call R.concat
global.get g.notAFunction call R.concat i32.const 0 local.get k throw 0

;; a call of f given argc inputs, when it takes another number of them
func checkInputs f:eq argc:i32 name:i32 k:i32 ->
local n i32
local words eq
local.get f ref.cast closure struct.get closure 2 local.set n
global.get g.quoted local.get name call R.nameText call R.concat global.get g.needs call R.concat
local.get n f64.convert_i32_s call R.numText call R.concat global.get g.inputWord call R.concat local.set words
local.get n i32.const 1 i32.ne if
  local.get words global.get g.pluralS call R.concat local.set words
end
local.get words global.get g.butGot call R.concat local.get argc f64.convert_i32_s call R.numText call R.concat i32.const 0 local.get k throw 0

;; 'for each n from a to b' with a or b that isn't a number
func checkRange from:eq to:eq k:i32 ->
global.get g.rangeWords local.get from call R.kindWords call R.concat global.get g.andWords call R.concat
local.get to call R.kindWords call R.concat i32.const 0 local.get k throw 0

;; 'set name of r to ...' when r isn't a record
func recordFor r:eq name:i32 k:i32 ->
global.get g.canOnlyChange local.get name call R.nameText call R.concat global.get g.ofARecordNot call R.concat
local.get r call R.kindWords call R.concat i32.const 0 local.get k throw 0

;; 'name of r' when r isn't a record
func notRecord r:eq name:i32 k:i32 ->
global.get g.cantTake local.get name call R.nameText call R.concat global.get g.ofWords call R.concat
local.get r call R.kindWords call R.concat i32.const 0 local.get k throw 0

;; ---------- what a value shows as, and the mistakes that show one (DESIGN §153) ----------
;; The rest of what lists, text, dictionaries and bytes do, and every mistake they make, here: a text's letters, a
;; dictionary's keys, 'add' to text and to amounts, and each mistake worded as vm.js words it, showing a value as
;; its show does. So these leave the module no more.

text wNo "no"
text wYes "yes"
text wNothing "nothing"
text wOpen "["
text wClose "]"
text wComma ", "
text wParen "("
text wParenClose ")"
text wRecordWith "(record with "
text wEmptyRecord "(empty record)"
text wDictWhere "(dictionary where "
text wIs " is "
text wEmptyDict "(empty dictionary)"
text wFunction "<function "
text wAngle ">"
text wByte "byte"
text wItem "item"
text wLetter "letter"
text wColon ": "
text wSpace " "
text wListAgain "[...]"
text wAgain "(...)"
text noKey1 "there is no "
text noKey2 " in this dictionary"
text didYouMean ". Did you mean "
text question "?"
text keyKinds "a dictionary's keys are text or numbers, not "
text lengthWords "'length of' needs a list, text, dictionary or bytes, not "
text goThroughWords "can only go through a list, text, dictionary or bytes, not "
text wholeWords "item numbers must be whole numbers, not "
text noItem "there is no item "
text fromOne ", items are counted from 1"
text onlyBytes ", there are only "
text theList ", the list only has "
text theText ", the text only has "
text changeWords "can only change items of a list, dictionary or bytes, not "
text takeWords "can only take an item of a list, text, dictionary or bytes, not "
text byteWords "a byte is a whole number from 0 to 255, not "
text removeWords "can only remove from a dictionary, not "
text addWords1 "can't add "
text addWords2 " to "
text repeatWords "repeat needs a whole number of times, not "
double d255 255
${UNITS.map((u, i) => `text unitOne${i} ${JSON.stringify(u[0])}\ntext unitMany${i} ${JSON.stringify(u[1])}\ndouble unitFactor${i} ${u[3]}`).join("\n")}

;; the values being shown further up, so a list, record or dictionary inside itself shows as [...] or (...)
global showing null:items mut ref.null items
global showingN i32 mut i32.const 0
;; the last text whose letters were asked about: where each letter begins, and how many there are
global lettersText eq mut ref.null eq
global letterStarts null:ids mut ref.null ids
global letterN i32 mut i32.const 0
;; names JavaScript gave ids to as the program ran (a table's rows' fields), after those in the program's data
global moreNames null:items mut ref.null items
global moreN i32 mut i32.const 0

;; x as vm.js's canon has it: a whole number, or one that isn't finite, as it is; any other to 15 digits, its sign
;; kept (canon itself takes only numbers above 0 that aren't whole)
func canonAny x:f64 -> f64
local.get x local.get x f64.trunc f64.eq local.get x local.get x f64.sub f64.const d0 f64.ne i32.or if
  local.get x return
end
local.get x f64.abs call R.canon local.get x f64.copysign

;; unit u's word: for one of it, or for more (many 1)
func unitWord u:i32 many:i32 -> eq
${UNITS.map((_, i) => `local.get u i32.const ${i} i32.eq if\n  local.get many if\n    global.get g.unitMany${i} return\n  end\n  global.get g.unitOne${i} return\nend`).join("\n")}
global.get g.wNothing

;; how many of the measure's base unit one of unit u is (vm.js's UNITS)
func unitFactor u:i32 -> f64
${UNITS.map((_, i) => `local.get u i32.const ${i} i32.eq if\n  f64.const unitFactor${i} return\nend`).join("\n")}
f64.const d1

;; a hex digit's unit, lowercase, as JSON writes them
func hexDigit d:i32 -> i32
local.get d i32.const 10 i32.lt_u if i32
  local.get d i32.const 48 i32.add
else
  local.get d i32.const 87 i32.add
end

;; text t in quotes, as JSON.stringify writes it: " and \ after a \, and \b \f \n \r \t; any other unit below 32,
;; and half of an emoji on its own, as \u and four hex digits
func quote t:eq -> eq
local p null:chars
local q null:chars
local n i32
local i i32
local j i32
local c i32
local d i32
local.get t ref.cast text struct.get text 1 local.set n
local.get t call R.units local.set p
local.get n i32.const 6 i32.mul i32.const 2 i32.add array.new_default chars local.set q
local.get q i32.const 0 i32.const 34 array.set chars
i32.const 1 local.set j
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get p local.get i array.get_u chars local.set c
  i32.const 0 local.set d
  ;; a high half followed by a low half: a whole emoji (d 2)
  local.get c i32.const 64512 i32.and i32.const 55296 i32.eq local.get i i32.const 1 i32.add local.get n i32.lt_u i32.and if
    local.get p local.get i i32.const 1 i32.add array.get_u chars i32.const 64512 i32.and i32.const 56320 i32.eq if
      i32.const 2 local.set d
    end
  end
  local.get d i32.const 2 i32.eq if
    local.get q local.get j local.get c array.set chars
    local.get q local.get j i32.const 1 i32.add local.get p local.get i i32.const 1 i32.add array.get_u chars array.set chars
    local.get j i32.const 2 i32.add local.set j
    local.get i i32.const 2 i32.add local.set i
  else
    ;; d: the letter after a \, or 1 for \u and four hex digits
    local.get c i32.const 34 i32.eq local.get c i32.const 92 i32.eq i32.or if
      local.get c local.set d
    end
    local.get c i32.const 8 i32.eq if
      i32.const 98 local.set d
    end
    local.get c i32.const 12 i32.eq if
      i32.const 102 local.set d
    end
    local.get c i32.const 10 i32.eq if
      i32.const 110 local.set d
    end
    local.get c i32.const 13 i32.eq if
      i32.const 114 local.set d
    end
    local.get c i32.const 9 i32.eq if
      i32.const 116 local.set d
    end
    local.get d i32.eqz local.get c i32.const 32 i32.lt_u local.get c i32.const 63488 i32.and i32.const 55296 i32.eq i32.or i32.and if
      i32.const 1 local.set d
    end
    local.get d i32.eqz if
      local.get q local.get j local.get c array.set chars
      local.get j i32.const 1 i32.add local.set j
    else
      local.get q local.get j i32.const 92 array.set chars
      local.get d i32.const 1 i32.eq if
        local.get q local.get j i32.const 1 i32.add i32.const 117 array.set chars
        local.get q local.get j i32.const 2 i32.add local.get c i32.const 12 i32.shr_u call R.hexDigit array.set chars
        local.get q local.get j i32.const 3 i32.add local.get c i32.const 8 i32.shr_u i32.const 15 i32.and call R.hexDigit array.set chars
        local.get q local.get j i32.const 4 i32.add local.get c i32.const 4 i32.shr_u i32.const 15 i32.and call R.hexDigit array.set chars
        local.get q local.get j i32.const 5 i32.add local.get c i32.const 15 i32.and call R.hexDigit array.set chars
        local.get j i32.const 6 i32.add local.set j
      else
        local.get q local.get j i32.const 1 i32.add local.get d array.set chars
        local.get j i32.const 2 i32.add local.set j
      end
    end
    local.get i i32.const 1 i32.add local.set i
  end
  br 0
end end
local.get q local.get j i32.const 34 array.set chars
local.get q local.get j i32.const 1 i32.add call R.newText

;; n and then word, with an s if n isn't 1: '3 items'
func plural n:i32 word:eq -> eq
local w eq
local.get n f64.convert_i32_s call R.numText global.get g.wSpace call R.concat local.get word call R.concat local.set w
local.get n i32.const 1 i32.ne if
  local.get w global.get g.pluralS call R.concat local.set w
end
local.get w

;; 1 if v is being shown further up
func showingHas v:eq -> i32
local i i32
block loop
  local.get i global.get g.showingN i32.ge_u br_if 1
  global.get g.showing local.get i array.get items local.get v ref.eq if
    i32.const 1 return
  end
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
i32.const 0

;; v on top of what's being shown
func showingPush v:eq ->
local bigger null:items
global.get g.showing ref.is_null if
  i32.const 8 array.new_default items global.set g.showing
end
global.get g.showingN global.get g.showing array.len i32.eq if
  global.get g.showingN i32.const 1 i32.shl array.new_default items local.tee bigger
  i32.const 0 global.get g.showing i32.const 0 global.get g.showingN array.copy items items
  local.get bigger global.set g.showing
end
global.get g.showing global.get g.showingN local.get v array.set items
global.get g.showingN i32.const 1 i32.add global.set g.showingN

;; v as text, as vm.js's show makes it: text as it is, or in quotes inside a list, record or dictionary (nested 1)
func show v:eq nested:i32 -> eq
local out eq
local n i32
local i i32
local x f64
local items null:items
local ids null:ids
local u null:u8
local first i32
local.get v ref.is_null if
  global.get g.wNothing return
end
local.get v ref.test i31 if
  local.get v ref.cast i31 i31.get_u local.tee n i32.const 2 i32.lt_u if
    local.get n if
      global.get g.wYes return
    end
    global.get g.wNo return
  end
  local.get v ref.cast i31 i31.get_s f64.convert_i32_s call R.numText return
end
local.get v ref.test num if
  local.get v ref.cast num struct.get num 0 call R.numText return
end
local.get v ref.test text if
  local.get nested if
    local.get v call R.quote return
  end
  local.get v return
end
local.get v ref.test closure if
  global.get g.wFunction local.get v ref.cast closure struct.get closure 3 call R.nameText call R.concat global.get g.wAngle call R.concat return
end
local.get v ref.test bytes if
  local.get v ref.cast bytes struct.get bytes 0 local.tee u array.len local.set n
  global.get g.wParen local.get n global.get g.wByte call R.plural call R.concat local.set out
  local.get n if
    local.get out global.get g.wColon call R.concat local.set out
    block loop
      local.get i local.get n i32.ge_u br_if 1
      local.get i if
        local.get out global.get g.wComma call R.concat local.set out
      end
      local.get out local.get u local.get i array.get_u u8 f64.convert_i32_s call R.numText call R.concat local.set out
      local.get i i32.const 1 i32.add local.set i
      br 0
    end end
  end
  local.get out global.get g.wParenClose call R.concat return
end
local.get v ref.test qty if
  ;; an amount: its number and its unit's word, for 1 of it or for more (1 mile, 2 miles)
  local.get v ref.cast qty struct.get qty 0 local.tee x call R.numText global.get g.wSpace call R.concat
  local.get v ref.cast qty struct.get qty 1 local.get x call R.canonAny f64.abs f64.const d1 f64.ne call R.unitWord call R.concat return
end
local.get v ref.test list local.get v ref.test record i32.or local.get v ref.test dict i32.or i32.eqz if
  global.get g.wNothing return
end
local.get v call R.showingHas if
  local.get v ref.test list if
    global.get g.wListAgain return
  end
  global.get g.wAgain return
end
local.get v call R.showingPush
local.get v ref.test list if
  local.get v ref.cast list struct.get list 0 local.set items
  local.get v ref.cast list struct.get list 1 local.set n
  global.get g.wOpen local.set out
  block loop
    local.get i local.get n i32.ge_u br_if 1
    local.get i if
      local.get out global.get g.wComma call R.concat local.set out
    end
    local.get out local.get items local.get i array.get items i32.const 1 call R.show call R.concat local.set out
    local.get i i32.const 1 i32.add local.set i
    br 0
  end end
  local.get out global.get g.wClose call R.concat local.set out
else
  local.get v ref.test record if
    local.get v ref.cast record struct.get record 0 local.set ids
    local.get v ref.cast record struct.get record 1 local.set items
    local.get v ref.cast record struct.get record 2 local.tee n if
      global.get g.wRecordWith local.set out
      block loop
        local.get i local.get n i32.ge_u br_if 1
        local.get i if
          local.get out global.get g.wComma call R.concat local.set out
        end
        local.get out local.get ids local.get i array.get ids call R.nameText call R.concat global.get g.wSpace call R.concat
        local.get items local.get i array.get items i32.const 1 call R.show call R.concat local.set out
        local.get i i32.const 1 i32.add local.set i
        br 0
      end end
      local.get out global.get g.wParenClose call R.concat local.set out
    else
      global.get g.wEmptyRecord local.set out
    end
  else
    ;; a dictionary: its keys and values in the order they were first set, past the places of keys taken out
    local.get v ref.cast dict struct.get dict 2 local.set n
    i32.const 1 local.set first
    global.get g.wDictWhere local.set out
    block loop
      local.get i local.get n i32.ge_u br_if 1
      local.get v ref.cast dict struct.get dict 0 local.get i array.get items ref.is_null i32.eqz if
        local.get first i32.eqz if
          local.get out global.get g.wComma call R.concat local.set out
        end
        i32.const 0 local.set first
        local.get out local.get v ref.cast dict struct.get dict 0 local.get i array.get items i32.const 1 call R.show call R.concat
        global.get g.wIs call R.concat
        local.get v ref.cast dict struct.get dict 1 local.get i array.get items i32.const 1 call R.show call R.concat local.set out
      end
      local.get i i32.const 1 i32.add local.set i
      br 0
    end end
    local.get first if
      global.get g.wEmptyDict local.set out
    else
      local.get out global.get g.wParenClose call R.concat local.set out
    end
  end
end
global.get g.showingN i32.const 1 i32.sub global.set g.showingN
local.get out

;; the letters of text t, as the VM counts them (an emoji as one): where each begins, in g.letterStarts, and how
;; many, in g.letterN. Kept for the last text asked about, so going through a long text a letter at a time,
;; 'item k of words' for each k, takes as long as the text is
func letters t:eq ->
local p null:chars
local s null:ids
local n i32
local i i32
local m i32
local.get t global.get g.lettersText ref.eq if
  return
end
local.get t ref.cast text struct.get text 1 local.set n
local.get t call R.units local.set p
local.get n i32.const 1 i32.add array.new_default ids local.set s
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get s local.get m local.get i array.set ids
  local.get m i32.const 1 i32.add local.set m
  local.get p local.get i array.get_u chars i32.const 64512 i32.and i32.const 55296 i32.eq local.get i i32.const 1 i32.add local.get n i32.lt_u i32.and if
    local.get p local.get i i32.const 1 i32.add array.get_u chars i32.const 64512 i32.and i32.const 56320 i32.eq if
      local.get i i32.const 1 i32.add local.set i
    end
  end
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get s local.get m local.get n array.set ids
local.get s global.set g.letterStarts
local.get m global.set g.letterN
local.get t global.set g.lettersText

;; units from up to to of text t, as a text of its own
func slice t:eq from:i32 to:i32 -> eq
local a null:chars
local.get to local.get from i32.sub array.new_default chars local.tee a
i32.const 0 local.get t call R.units local.get from local.get to local.get from i32.sub array.copy chars chars
local.get a local.get to local.get from i32.sub call R.newText

;; letter i of text t, from 0
func letterAt t:eq i:i32 -> eq
local.get t call R.letters
local.get t global.get g.letterStarts local.get i array.get ids global.get g.letterStarts local.get i i32.const 1 i32.add array.get ids call R.slice

;; a text's letters, as a list, for 'for each'
func lettersList t:eq -> eq
local items null:items
local i i32
local n i32
local.get t call R.letters
global.get g.letterN local.tee n array.new_default items local.set items
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get items local.get i local.get t local.get i call R.letterAt array.set items
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get items ref.as_non_null local.get n struct.new list

;; a dictionary's keys, as a list, in the order they were first set, for 'for each'
func dictKeys d:eq -> eq
local dd null:dict
local items null:items
local i i32
local m i32
local.get d ref.cast dict local.tee dd struct.get dict 3 array.new_default items local.set items
block loop
  local.get i local.get dd struct.get dict 2 i32.ge_u br_if 1
  local.get dd struct.get dict 0 local.get i array.get items ref.is_null i32.eqz if
    local.get items local.get m local.get dd struct.get dict 0 local.get i array.get items array.set items
    local.get m i32.const 1 i32.add local.set m
  end
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get items ref.as_non_null local.get m struct.new list

;; how many edits make text a into text b, as vm.js's distance counts them: a unit put in, taken out or changed,
;; or two side by side swapped
func distance a:eq b:eq -> i32
local p null:chars
local q null:chars
local n i32
local m i32
local w i32
local d null:ids
local i i32
local j i32
local cost i32
local best i32
local t i32
local.get a ref.cast text struct.get text 1 local.set n
local.get b ref.cast text struct.get text 1 local.set m
local.get a call R.units local.set p
local.get b call R.units local.set q
local.get m i32.const 1 i32.add local.set w
local.get n i32.const 1 i32.add local.get w i32.mul array.new_default ids local.set d
block loop
  local.get i local.get n i32.gt_u br_if 1
  local.get d local.get i local.get w i32.mul local.get i array.set ids
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
block loop
  local.get j local.get m i32.gt_u br_if 1
  local.get d local.get j local.get j array.set ids
  local.get j i32.const 1 i32.add local.set j
  br 0
end end
i32.const 1 local.set i
block loop
  local.get i local.get n i32.gt_u br_if 1
  i32.const 1 local.set j
  block loop
    local.get j local.get m i32.gt_u br_if 1
    local.get p local.get i i32.const 1 i32.sub array.get_u chars local.get q local.get j i32.const 1 i32.sub array.get_u chars i32.ne local.set cost
    local.get d local.get i i32.const 1 i32.sub local.get w i32.mul local.get j i32.add array.get ids i32.const 1 i32.add local.set best
    local.get d local.get i local.get w i32.mul local.get j i32.add i32.const 1 i32.sub array.get ids i32.const 1 i32.add local.tee t local.get best i32.lt_u if
      local.get t local.set best
    end
    local.get d local.get i i32.const 1 i32.sub local.get w i32.mul local.get j i32.add i32.const 1 i32.sub array.get ids local.get cost i32.add local.tee t local.get best i32.lt_u if
      local.get t local.set best
    end
    local.get i i32.const 1 i32.gt_u local.get j i32.const 1 i32.gt_u i32.and if
      local.get p local.get i i32.const 1 i32.sub array.get_u chars local.get q local.get j i32.const 2 i32.sub array.get_u chars i32.eq
      local.get p local.get i i32.const 2 i32.sub array.get_u chars local.get q local.get j i32.const 1 i32.sub array.get_u chars i32.eq i32.and if
        local.get d local.get i i32.const 2 i32.sub local.get w i32.mul local.get j i32.add i32.const 2 i32.sub array.get ids i32.const 1 i32.add local.tee t local.get best i32.lt_u if
          local.get t local.set best
        end
      end
    end
    local.get d local.get i local.get w i32.mul local.get j i32.add local.get best array.set ids
    local.get j i32.const 1 i32.add local.set j
    br 0
  end end
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get d local.get n local.get w i32.mul local.get m i32.add array.get ids

;; of dictionary d's keys that are text, the one text key most likely meant, or null: as vm.js's closest picks,
;; within 1 edit for 3 units or fewer and 2 for more, the first of the nearest
func closestKey key:eq d:eq -> eq
local dd null:dict
local best eq
local most i32
local i i32
local c eq
local e i32
local.get key ref.cast text struct.get text 1 i32.const 3 i32.le_u if i32
  i32.const 2
else
  i32.const 3
end
local.set most
local.get d ref.cast dict local.set dd
block loop
  local.get i local.get dd struct.get dict 2 i32.ge_u br_if 1
  local.get dd struct.get dict 0 local.get i array.get items local.tee c ref.test text if
    local.get key local.get c call R.distance local.tee e local.get most i32.lt_u if
      local.get c local.set best
      local.get e local.set most
    end
  end
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get best

;; the mistake of key, which a dictionary doesn't have (as it keeps keys): 'there is no "aple" in this
;; dictionary. Did you mean "apple"?'
func notIn d:eq key:eq k:i32 ->
local words eq
local guess eq
global.get g.noKey1 local.get key i32.const 1 call R.show call R.concat global.get g.noKey2 call R.concat local.set words
local.get key ref.test text if
  local.get key local.get d call R.closestKey local.tee guess ref.is_null i32.eqz if
    local.get words global.get g.didYouMean call R.concat local.get guess i32.const 1 call R.show call R.concat global.get g.question call R.concat local.set words
  end
end
local.get words i32.const 0 local.get k throw 0

;; the mistake of a dictionary's key that isn't text or a number
func keyKind key:eq k:i32 ->
global.get g.keyKinds local.get key call R.kindWords call R.concat i32.const 0 local.get k throw 0

;; 1 if v is text or a number, as a dictionary's keys are
func isKey v:eq -> i32
local.get v ref.test text local.get v call R.isNumber i32.or

;; where item n is in a list, bytes or text (what 0, 1 or 2) of size items, bytes or letters: its place from 0,
;; n a whole number from 1 to size to 15 digits, as vm.js's item finds it; or the mistake
func placeOf n:eq size:i32 what:i32 k:i32 -> i32
local x f64
local shown eq
local words eq
local.get n local.set shown
local.get n call R.isNumber if
  local.get n call R.numberOf call R.canonAny local.tee x call R.box local.set shown
end
local.get n call R.isNumber i32.eqz local.get x local.get x f64.trunc f64.ne i32.or local.get x local.get x f64.sub f64.const d0 f64.ne i32.or if
  global.get g.wholeWords local.get shown i32.const 1 call R.show call R.concat i32.const 0 local.get k throw 0
end
local.get x f64.const d1 f64.lt if
  global.get g.noItem local.get x call R.numText call R.concat global.get g.fromOne call R.concat i32.const 0 local.get k throw 0
end
local.get x local.get size f64.convert_i32_s f64.gt if
  global.get g.noItem local.get x call R.numText call R.concat local.set words
  local.get what i32.const 1 i32.eq if
    local.get words global.get g.onlyBytes call R.concat local.get size global.get g.wByte call R.plural call R.concat i32.const 0 local.get k throw 0
  end
  local.get what if
    local.get words global.get g.theText call R.concat local.get size global.get g.wLetter call R.plural call R.concat i32.const 0 local.get k throw 0
  end
  local.get words global.get g.theList call R.concat local.get size global.get g.wItem call R.plural call R.concat i32.const 0 local.get k throw 0
end
local.get x i32.trunc_f64_s i32.const 1 i32.sub

;; 'item n of target', for what the module hasn't found: a key a dictionary doesn't have, a text's letter, an item
;; at a place given past 15 digits, or the mistake, as vm.js's item words it
func itemRest target:eq n:eq k:i32 -> eq
local at i32
local.get target ref.test dict if
  local.get n call R.isKey i32.eqz if
    local.get n local.get k call R.keyKind
  end
  local.get target local.get n call R.dictKey local.get k call R.notIn
  local.get target return
end
local.get target ref.test list if
  local.get n local.get target ref.cast list struct.get list 1 i32.const 0 local.get k call R.placeOf local.set at
  local.get target ref.cast list struct.get list 0 local.get at array.get items return
end
local.get target ref.test bytes if
  local.get n local.get target ref.cast bytes struct.get bytes 0 array.len i32.const 1 local.get k call R.placeOf local.set at
  local.get target ref.cast bytes struct.get bytes 0 local.get at array.get_u u8 f64.convert_i32_s call R.box return
end
local.get target ref.test text if
  local.get target call R.letters
  local.get n global.get g.letterN i32.const 2 local.get k call R.placeOf local.set at
  local.get target local.get at call R.letterAt return
end
global.get g.takeWords local.get target call R.kindWords call R.concat i32.const 0 local.get k throw 0

;; where 'set item n of target to ...' goes, for what the module hasn't found: a list's place for an item given past
;; 15 digits, -1 for bytes or a dictionary (put sees to those), or the mistake
func itemRefRest target:eq n:eq k:i32 -> i32
local at i32
local.get target ref.test dict if
  local.get n call R.isKey i32.eqz if
    local.get n local.get k call R.keyKind
  end
  i32.const -1 return
end
local.get target ref.test list if
  local.get n local.get target ref.cast list struct.get list 1 i32.const 0 local.get k call R.placeOf return
end
local.get target ref.test bytes if
  local.get n local.get target ref.cast bytes struct.get bytes 0 array.len i32.const 1 local.get k call R.placeOf local.set at
  i32.const -1 return
end
global.get g.changeWords local.get target call R.kindWords call R.concat i32.const 0 local.get k throw 0

;; a value put where 'set item n of target' said, that the module hasn't put: a dictionary's key, a list's item at a
;; place given past 15 digits, or a byte that's a whole number from 0 to 255 to 15 digits; or the mistake
func putRest target:eq n:eq v:eq k:i32 ->
local at i32
local x f64
local shown eq
local.get target ref.test dict if
  local.get n call R.isKey i32.eqz if
    local.get n local.get k call R.keyKind
  end
  local.get target ref.cast dict local.get n call R.dictKey local.get v call R.dictSet
  return
end
local.get target ref.test list if
  local.get n local.get target ref.cast list struct.get list 1 i32.const 0 local.get k call R.placeOf local.set at
  local.get target ref.cast list struct.get list 0 local.get at local.get v array.set items
  return
end
local.get target ref.test bytes if
  local.get n local.get target ref.cast bytes struct.get bytes 0 array.len i32.const 1 local.get k call R.placeOf local.set at
  local.get v local.set shown
  local.get v call R.isNumber if
    local.get v call R.numberOf call R.canonAny local.tee x call R.box local.set shown
    local.get x local.get x f64.trunc f64.eq local.get x f64.const d0 f64.ge i32.and local.get x f64.const d255 f64.le i32.and if
      local.get target ref.cast bytes struct.get bytes 0 local.get at local.get x i32.trunc_f64_s array.set u8
      return
    end
  end
  global.get g.byteWords local.get shown i32.const 1 call R.show call R.concat i32.const 0 local.get k throw 0
end
global.get g.changeWords local.get target call R.kindWords call R.concat i32.const 0 local.get k throw 0

;; 'remove key from target' that the module hasn't: a key a dictionary doesn't have, or the mistake
func removeRest key:eq target:eq k:i32 ->
local.get target ref.test dict i32.eqz if
  global.get g.removeWords local.get target call R.kindWords call R.concat i32.const 0 local.get k throw 0
end
local.get key call R.isKey i32.eqz if
  local.get key local.get k call R.keyKind
end
local.get target local.get key call R.dictKey local.get k call R.notIn

;; 'length of v' for what isn't a list, bytes or a dictionary: a text's letters, or the mistake
func lengthRest v:eq k:i32 -> f64
local.get v ref.test text if
  local.get v call R.letters global.get g.letterN f64.convert_i32_s return
end
global.get g.lengthWords local.get v call R.kindWords call R.concat i32.const 0 local.get k throw 0

;; what 'for each' goes through, for what isn't a list or bytes: a text's letters, a dictionary's keys, or the mistake
func itemsRest v:eq k:i32 -> eq
local.get v ref.test text if
  local.get v call R.lettersList return
end
local.get v ref.test dict if
  local.get v call R.dictKeys return
end
global.get g.goThroughWords local.get v call R.kindWords call R.concat i32.const 0 local.get k throw 0

;; 'add value to name', for what the module hasn't added: text, amounts of the same measure, or the mistake; the
;; variable's new value
func addRest current:eq value:eq name:i32 k:i32 -> eq
local u i32
local w i32
local x f64
local.get current ref.test unset if
  global.get g.noValue1 local.get name call R.nameText call R.concat global.get g.noValue2 call R.concat
  local.get name call R.nameText call R.concat global.get g.noValue3 call R.concat i32.const 0 local.get k throw 0
end
local.get current ref.test list if
  local.get current local.get value call R.push local.get current return
end
local.get current ref.test text if
  local.get current local.get value i32.const 0 call R.show call R.concat return
end
local.get current ref.test qty local.get value ref.test qty i32.and if
  global.get g.unitMeasure local.get current ref.cast qty struct.get qty 1 local.tee u array.get ids
  global.get g.unitMeasure local.get value ref.cast qty struct.get qty 1 local.tee w array.get ids i32.eq if
    ;; 5 km + 300 m is 5.3 km: value in current's unit, as vm.js's amountIn makes it
    local.get value ref.cast qty struct.get qty 0 local.set x
    local.get u local.get w i32.ne if
      local.get x local.get w call R.unitFactor f64.mul local.get u call R.unitFactor f64.div local.set x
    end
    local.get current ref.cast qty struct.get qty 0 local.get x f64.add local.get u struct.new qty return
  end
end
local.get current call R.isNumber local.get value call R.isNumber i32.and if
  local.get current call R.numberOf local.get value call R.numberOf f64.add call R.box return
end
global.get g.addWords1 local.get value call R.kindWords call R.concat global.get g.addWords2 call R.concat
local.get current call R.kindWords call R.concat i32.const 0 local.get k throw 0

;; how many times 'repeat' goes round, when it isn't an exact whole number: a whole number to 15 digits, or the
;; mistake
func repeatRest n:eq k:i32 -> f64
local x f64
local shown eq
local.get n local.set shown
local.get n call R.isNumber if
  local.get n call R.numberOf call R.canonAny local.tee x local.get x f64.trunc f64.eq local.get x f64.const d0 f64.ge i32.and
  local.get x local.get x f64.sub f64.const d0 f64.eq i32.and if
    local.get x return
  end
  local.get x call R.box local.set shown
end
global.get g.repeatWords local.get shown i32.const 1 call R.show call R.concat i32.const 0 local.get k throw 0

;; for JavaScript: a name it gave the next id to as the program ran (a table's row's field)
export addName t:eq ->
local bigger null:items
global.get g.moreNames ref.is_null if
  i32.const 8 array.new_default items global.set g.moreNames
end
global.get g.moreN global.get g.moreNames array.len i32.eq if
  global.get g.moreN i32.const 1 i32.shl array.new_default items local.tee bigger
  i32.const 0 global.get g.moreNames i32.const 0 global.get g.moreN array.copy items items
  local.get bigger global.set g.moreNames
end
global.get g.moreNames global.get g.moreN local.get t array.set items
global.get g.moreN i32.const 1 i32.add global.set g.moreN

;; ---------- a record's "did you mean", and inputs that say what they are (DESIGN §154) ----------

text noField1 "this record has no '"
text guessField "'. Did you mean '"
text guessEnd "'?"
text toBe " to be "
text notComma ", not "
text kindYesOrNo "yes or no"
;; each function whose inputs say what they are, from the program's data: for function j, where its inputs start;
;; there, how many it has, then each one's name and its kind plus 1 (0 for any)
global kindsData null:ids mut ref.null ids

;; of record r's fields, the name most likely meant, or null: as vm.js's closest picks, within 1 edit for 3 units
;; or fewer and 2 for more, the first of the nearest
func closestField name:eq r:eq -> eq
local rr null:record
local best eq
local most i32
local i i32
local c eq
local e i32
local.get name ref.cast text struct.get text 1 i32.const 3 i32.le_u if i32
  i32.const 2
else
  i32.const 3
end
local.set most
local.get r ref.cast record local.set rr
block loop
  local.get i local.get rr struct.get record 2 i32.ge_u br_if 1
  local.get rr struct.get record 0 local.get i array.get ids call R.nameText local.set c
  local.get name local.get c call R.distance local.tee e local.get most i32.lt_u if
    local.get c local.set best
    local.get e local.set most
  end
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get best

;; 'name of r', r a record without that field: "this record has no 'nmae'. Did you mean 'name'?"
func fieldRest r:eq name:i32 k:i32 ->
local words eq
local field eq
local guess eq
local.get name call R.nameText local.set field
global.get g.noField1 local.get field call R.concat local.set words
local.get field local.get r call R.closestField local.tee guess ref.is_null if
  local.get words global.get g.quoted call R.concat local.set words
else
  local.get words global.get g.guessField call R.concat local.get guess call R.concat global.get g.guessEnd call R.concat local.set words
end
local.get words i32.const 0 local.get k throw 0

;; KINDS[w] in vm.js: what an input that says what it is says it is
func kindName w:i32 -> eq
local.get w i32.eqz if
  global.get g.kindNumber return
end
local.get w i32.const 1 i32.eq if
  global.get g.kindText return
end
local.get w i32.const 2 i32.eq if
  global.get g.kindYesOrNo return
end
local.get w i32.const 3 i32.eq if
  global.get g.kindList return
end
local.get w i32.const 4 i32.eq if
  global.get g.kindRecord return
end
local.get w i32.const 5 i32.eq if
  global.get g.kindDictionary return
end
local.get w i32.const 6 i32.eq if
  global.get g.kindBytes return
end
global.get g.kindFunction

;; 1 if v is kind w, as vm.js's fitsKind has it
func fitsKind v:eq w:i32 -> i32
local.get w i32.eqz if
  local.get v call R.isNumber return
end
local.get w i32.const 1 i32.eq if
  local.get v ref.test text return
end
local.get w i32.const 2 i32.eq if
  local.get v ref.test i31 if i32
    local.get v ref.cast i31 i31.get_u i32.const 2 i32.lt_u
  else
    i32.const 0
  end
  return
end
local.get w i32.const 3 i32.eq if
  local.get v ref.test list return
end
local.get w i32.const 4 i32.eq if
  local.get v ref.test record return
end
local.get w i32.const 5 i32.eq if
  local.get v ref.test dict return
end
local.get w i32.const 6 i32.eq if
  local.get v ref.test bytes return
end
local.get v ref.test closure

;; input i, v, of a call at position k of function name, whose inputs say what they are (entry id in g.kindsData):
;; the mistake if v isn't the kind it says, as vm.js's checkKinds words it
func checkKind id:i32 i:i32 v:eq name:i32 k:i32 ->
local at i32
local wanted i32
global.get g.kindsData local.get id array.get ids local.set at
global.get g.kindsData local.get at i32.const 2 i32.add local.get i i32.const 1 i32.shl i32.add array.get ids i32.const 1 i32.sub local.tee wanted i32.const 0 i32.lt_s if
  return
end
local.get v local.get wanted call R.fitsKind if
  return
end
global.get g.quoted local.get name call R.nameText call R.concat global.get g.needs call R.concat
global.get g.kindsData local.get at i32.const 1 i32.add local.get i i32.const 1 i32.shl i32.add array.get ids call R.nameText call R.concat
global.get g.toBe call R.concat local.get wanted call R.kindName call R.concat global.get g.notComma call R.concat
local.get v call R.kindWords call R.concat i32.const 0 local.get k throw 0

;; ---------- text ----------
;; Text is a view of the first 'len' units of a buffer: its UTF-16 units, and how many of them are in use, so
;; text that ends where its buffer's in-use units end can have more added in place, and joining text in a
;; loop takes as long as the text is. Units past those in use are never changed, so every view stays as it was.
;; Text JavaScript made keeps its string, and gets units only when the module needs them (im.fill).

;; text of the first n units of an array, which it owns
func newText units:null:chars n:i32 -> ref:text
local.get units local.get n struct.new strbuf local.get n ref.null extern struct.new text

;; t's units
func units t:eq -> null:chars
local x null:text
local.get t ref.cast text local.tee x struct.get text 0 ref.is_null if
  local.get t call im.fill
end
local.get x struct.get text 0 struct.get strbuf 0

;; how many units a buffer for n of them has, with room to grow
func roomFor n:i32 -> i32
local r i32
local.get n i32.const 268435456 i32.ge_u if
  local.get n return
end
local.get n local.get n i32.const 1 i32.shr_u i32.add i32.const 8 i32.add local.tee r
i32.const 536870888 i32.gt_u if i32 i32.const 536870888 else local.get r end

;; text a then text b, as one
func concat a:eq b:eq -> eq
local x null:text
local buf null:strbuf
local au null:chars
local fresh null:chars
local n i32
local m i32
local total i32
local.get a ref.cast text local.tee x struct.get text 1 local.set n
local.get b ref.cast text struct.get text 1 local.tee m i32.eqz if
  local.get a return
end
local.get n i32.eqz if
  local.get b return
end
local.get n local.get m i32.add local.tee total i32.const 536870888 i32.gt_u if
  ;; longer than JavaScript's longest text: the VM says what that does
  call im.tooDeep
end
local.get a call R.units local.set au
local.get x struct.get text 0 local.tee buf struct.get strbuf 1 local.get n i32.eq if
  ;; a ends where its buffer's text does: b goes after it, in place
  local.get au array.len local.get total i32.lt_u if
    ;; no room: a bigger array, for a and the text it begins
    local.get total call R.roomFor array.new_default chars local.tee fresh
    i32.const 0 local.get au i32.const 0 local.get n array.copy chars chars
    local.get buf local.get fresh struct.set strbuf 0
    local.get fresh local.set au
  end
  local.get au local.get n local.get b call R.units i32.const 0 local.get m array.copy chars chars
  local.get buf local.get total struct.set strbuf 1
  local.get buf local.get total ref.null extern struct.new text
  return
end
;; a begins longer text already: both copied into a new array
local.get total call R.roomFor array.new_default chars local.tee fresh
i32.const 0 local.get au i32.const 0 local.get n array.copy chars chars
local.get fresh local.get n local.get b call R.units i32.const 0 local.get m array.copy chars chars
local.get fresh local.get total struct.new strbuf local.get total ref.null extern struct.new text

;; 1 if texts a and b have the same units
func sameText a:eq b:eq -> i32
local p null:chars
local q null:chars
local n i32
local i i32
local.get a ref.cast text struct.get text 1 local.tee n local.get b ref.cast text struct.get text 1 i32.ne if
  i32.const 0 return
end
local.get a call R.units local.set p
local.get b call R.units local.tee q local.get p ref.eq if
  i32.const 1 return
end
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get p local.get i array.get_u chars local.get q local.get i array.get_u chars i32.ne if
    i32.const 0 return
  end
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
i32.const 1

;; texts a and b in order, as JavaScript orders strings (unit by unit): -1, 0 or 1
func textOrder a:eq b:eq -> i32
local p null:chars
local q null:chars
local n i32
local m i32
local i i32
local u i32
local v i32
local.get a ref.cast text struct.get text 1 local.set n
local.get b ref.cast text struct.get text 1 local.set m
local.get a call R.units local.set p
local.get b call R.units local.set q
block loop
  local.get i local.get n i32.ge_u local.get i local.get m i32.ge_u i32.or br_if 1
  local.get p local.get i array.get_u chars local.tee u local.get q local.get i array.get_u chars local.tee v i32.ne if
    local.get u local.get v i32.lt_u if i32 i32.const -1 else i32.const 1 end return
  end
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get n local.get m i32.lt_u if i32 i32.const -1 else local.get n local.get m i32.gt_u end

;; ---------- what JavaScript calls to move text in and out ----------

;; a text's JavaScript string, if it has one yet, or null
export textJs t:eq -> extern
local.get t ref.cast text struct.get text 2

export setTextJs t:eq s:extern ->
local.get t ref.cast text local.get s struct.set text 2

export textLength t:eq -> i32
local.get t ref.cast text struct.get text 1

export textUnit t:eq i:i32 -> i32
local.get t call R.units local.get i array.get_u chars

;; text JavaScript made: its string, and how many units it has
export makeTextJs s:extern n:i32 -> eq
ref.null strbuf local.get n local.get s struct.new text

;; units for text JavaScript made, for it to fill in with textPut
export textBegin t:eq ->
local x null:text
local.get t ref.cast text local.tee x local.get x struct.get text 1 array.new_default chars local.get x struct.get text 1 struct.new strbuf struct.set text 0

export textPut t:eq i:i32 c:i32 ->
local.get t ref.cast text struct.get text 0 struct.get strbuf 0 local.get i local.get c array.set chars

;; t's units from place 'from' on, 32,768 at most, copied into the memory for JavaScript to read; how many
export textOut t:eq from:i32 -> i32
local u null:chars
local n i32
local i i32
local.get t call R.units local.set u
local.get t ref.cast text struct.get text 1 local.get from i32.sub local.tee n i32.const 32768 i32.gt_u if
  i32.const 32768 local.set n
end
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get i i32.const 1 i32.shl local.get u local.get from local.get i i32.add array.get_u chars i32.store16 1 0
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
local.get n

;; t's JavaScript string, if it has one; if not, null, with how many units it has in the memory's first 4 bytes
;; and the first 32,766 of them after, for JavaScript to make the string from (and textOut the rest), in one call
export textView t:eq -> extern
local s extern
local u null:chars
local n i32
local i i32
local.get t ref.cast text struct.get text 2 local.tee s ref.is_null i32.eqz if
  local.get s return
end
local.get t call R.units local.set u
i32.const 0 local.get t ref.cast text struct.get text 1 local.tee n i32.store 2 0
local.get n i32.const 32766 i32.gt_u if
  i32.const 32766 local.set n
end
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get i i32.const 1 i32.shl local.get u local.get i array.get_u chars i32.store16 1 4
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
ref.null extern

;; the same for a list's item i, which may not be text: then null, with -1 in the memory's first 4 bytes
export listView l:eq i:i32 -> extern
local it eq
local.get l ref.cast list struct.get list 0 local.get i array.get items local.tee it ref.test text if externref
  local.get it call R.textView
else
  i32.const 0 i32.const -1 i32.store 2 0
  ref.null extern
end

;; n units JavaScript put in the memory, copied into t's from place 'at' on (see textBegin)
export textIn t:eq at:i32 n:i32 ->
local u null:chars
local i i32
local.get t ref.cast text struct.get text 0 struct.get strbuf 0 local.set u
block loop
  local.get i local.get n i32.ge_u br_if 1
  local.get u local.get at local.get i i32.add local.get i i32.const 1 i32.shl i32.load16_u 1 0 array.set chars
  local.get i i32.const 1 i32.add local.set i
  br 0
end end
`;

// ---------- reading it ----------

const DOUBLE_BYTES = (value) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, value, true);
  return [...new Uint8Array(view.buffer)];
};

// The source as both back ends read it: no comments, a line for each double (with its 8 bytes), global,
// function and local, and all of a function's instructions on one line after them, starting `code`.
export function clean(source) {
  const out = [];
  let code = null;
  const flush = () => {
    if (code !== null) out.push(`code ${code.join(" ")}`.trimEnd());
    code = null;
  };
  for (const raw of source.split("\n")) {
    const line = raw.replace(/;;.*$/, "").trim().replace(/\s+/g, " ");
    if (!line) continue;
    const [word, ...rest] = line.split(" ");
    if (word === "double") {
      flush();
      out.push(`double ${rest[0]} ${DOUBLE_BYTES(Number(rest[1])).join(" ")}`);
    } else if (word === "text") { // a global, made with the module: its units, as a buffer, and a text of them all
      flush();
      const words = JSON.parse(line.slice(line.indexOf('"')));
      const units = Array.from({ length: words.length }, (_, i) => `i32.const ${words.charCodeAt(i)}`).join(" ");
      const n = words.length;
      out.push(`global ${rest[0]} ref:text const ${units} array.new_fixed chars ${n} i32.const ${n} struct.new strbuf i32.const ${n} ref.null extern struct.new text`);
    } else if (word === "global" || word === "memory") {
      flush();
      out.push(line);
    } else if (word === "func" || word === "export") {
      flush();
      out.push(line);
      code = [];
    } else if (word === "local") {
      if (code === null || code.length) throw new Error(`wasm-runtime.js: a local comes before a function's instructions: ${line}`);
      out.push(line);
    } else {
      if (code === null) throw new Error(`wasm-runtime.js: instructions outside a function: ${line}`);
      code.push(line);
    }
  }
  flush();
  return out.join("\n");
}

export const RUNTIME = clean(SOURCE);

// What the cleaned source holds: { memories: [{ name, pages }], doubles: Map of name to value, globals: [{ name,
// type, mutable, init }], funcs: [{ name, exported, params: [[name, type]], results: [type], locals: [[name,
// type]], code }] }, each type as written (i32, ref:big...), for the back end to make its own.
export function parseRuntime(text = RUNTIME) {
  const memories = [];
  const doubles = new Map();
  const globals = [];
  const funcs = [];
  for (const line of text.split("\n")) {
    const words = line.split(" ");
    const word = words[0];
    if (word === "memory") {
      memories.push({ name: words[1], pages: Number(words[2]) });
    } else if (word === "double") {
      doubles.set(words[1], new DataView(Uint8Array.from(words.slice(2).map(Number)).buffer).getFloat64(0, true));
    } else if (word === "global") {
      globals.push({ name: words[1], type: words[2], mutable: words[3] === "mut", init: words.slice(4).join(" ") });
    } else if (word === "func" || word === "export") {
      const arrow = words.indexOf("->");
      const params = words.slice(2, arrow).map((p) => {
        const colon = p.indexOf(":");
        return [p.slice(0, colon), p.slice(colon + 1)];
      });
      funcs.push({ name: words[1], exported: word === "export", params, results: words.slice(arrow + 1), locals: [], code: "" });
    } else if (word === "local") {
      funcs.at(-1).locals.push([words[1], words[2]]);
    } else {
      funcs.at(-1).code = words.slice(1).join(" ");
    }
  }
  return { memories, doubles, globals, funcs };
}
