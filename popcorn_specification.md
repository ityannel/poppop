# PopCorn 言語仕様

PopCorn 1

この文書は PopCorn 1 の公開仕様です。処理名、型名、演算子名、コード例は英語表記を使いますが、説明文はすべて日本語で書いています。

この文書で「返す」と書いたときは、処理結果を次のパイプ段階へ渡すことを意味します。「エラー」と書いたときは、その時点で通常の実行を止めて PopCorn エラーを出すことを意味します。コード例は、特にことわりがない限りそのまま動かせます。

## 1. 基本方針

PopCorn は、値を `>>` で次の処理へ渡していくデータフロー言語です。値の加工は非破壊的で、元のリストや辞書を書き換えません。画面表示やファイル操作など外部へ作用する処理は、値の加工とは分けて扱います。

ふつうの文は `.` で終え、ブロックは `:` で開いて、字下げで本体を書きます。字下げがブロックの終わりを決めます（4章「`:` と字下げで書くブロック」）。それ以外の空白・改行は、読みやすさのために自由に使えます。ブロックで終わる文の末尾（`Map: ...` や `pop 関数名: ...` など）と、ブロック内の最後に書かれた文（1文だけの場合を含む）では、文末の `.` を省略できます。

### 言語の分類と特徴

PopCorn 1 は、次の性質を組み合わせたデータフロー言語です。

| 分類軸 | PopCorn 1 の性質 |
|---|---|
| パラダイム | データフロー型 ＋ 関数型寄り（`Loop`・`Break`・`Return` などの手続き型要素も備える） |
| データの扱い | 非破壊（イミュータブル）中心。クラスやオブジェクト指向・ドット記法を持たない |
| 型システム | 強い動的型付け（型注釈は不要だが、暗黙の真偽値変換などは禁止） |
| 評価とスコープ | 先行評価（`and`/`or` は短絡評価）・レキシカルスコープ |
| 構文の向き | 代入・関数定義・加工のすべてが左から右（`>>`）に統一 |
| 主な用途 | API・JSON 加工、自動化スクリプト、プログラミング入門（関数はファイルに分けて `Use` で読めます） |

```
42 >> answer.
answer >> Display.
```

`//` から行末まではコメントとして無視されます。

### ソースと字句

ソースコードは UTF-8 の文字列として読み込みます。字句解析は先頭から進み、空白・タブ・改行・コメントをトークンの区切りとして扱います。ただし文字列リテラルの中では、これらもそのまま文字の一部になります。

字句解析で認識する記号は次のとおりです。

| 分類 | 記号 |
|---|---|
| 文とブロック | `.`、`:` |
| パイプ | `>>`、`>?>`（途中を覗く）、`>!>`（失敗したら差し替える） |
| グループ | `( )`、`[ ]`、`{ }`（`{ }` は辞書だけ） |
| 区切り | `,` |
| アクセス | `::`、`@` |
| 演算子 | `+ - * / % == != > < >= <=`、単語の演算子 `and` `or` `not` `in` `not in` |

### 評価の順序

式とパイプラインは左から右へ、必要になったタイミングで評価します。関数呼び出しや標準処理は現在値を受け取り、その結果を次の段階へ渡します。`and` と `or` だけは短絡評価を行うため、左辺だけで結果が決まるときは右辺を評価しません。

`:` のブロックの字下げと、ブロックのあとの行の字下げを除けば、改行・空白・空行を増やしたり減らしたりしてもプログラムの意味は変わりません。文を区切るときは `.` を使ってください。

## 2. 名前と表記

識別子には ASCII の英字・数字・`_` が使えます。先頭は英字か `_` にします（正規表現では `[A-Za-z_][A-Za-z0-9_]*` です）。大文字と小文字は区別されるため、`Map` と `map` は別の名前として共存できます。標準処理名と大文字・小文字だけが違うユーザー名には、処理系やエディタが注意を出してもかまいませんが、自動修正はしません。

標準のパイプ処理と型変換処理は、先頭を大文字にしたキャメルケースで書きます。

```
Map  Filter  Count  Any  All  Reduce  Sort  SortDesc  Group  Fork  Update  Check  Loop  Try  Catch
Break  Return  Use  Zip  Bool  Str  List  Dict  Num  Type
```

次の語は小文字の予約語です。

```
when  else  as  pop  true  false  null  and  or  not  in
```

予約語になるのは、上と完全に同じ綴りだけです。

名前の役割は書き方から見分けられます。

| 表記 | 役割 | 例 |
|---|---|---|
| 先頭が小文字または `_` | 値の名前、引数、別名、ラベル | `score`、`user_name`、`_temporary` |
| 先頭が大文字 | 標準処理またはユーザー関数（`>>` の右側のほか、処理名だけでも書けます） | `Map`、`AddTwo`、`Pi` |
| `@` | 現在値 | `@ * 2` |

## 3. 値と型

PopCorn では次の型を扱います。

| 型 | 表記例 | 内部仕様 |
|---|---|---|
| `Null` | `null` | 値がないことを表す単一の値 |
| `Bool` | `true`、`false` | 真偽値 |
| `Num` | `42`、`3.14` | IEEE 754 倍精度浮動小数点数（`NaN`・`Infinity` になる演算は `RuntimeError`）。添字や回数には小数部のない整数値を使います |
| `Str` | `"PopCorn"`、`'PopCorn'` | Unicode コードポイント列 |
| `List` | `[1, 2, 3]` | 順序付き配列（添字は 0 から始まります） |
| `Dict` | `{"name": "PopCorn"}` | 挿入順を保つ連想配列（キーは `Str`） |
| 値リスト（`Tuple`） | `(first, second)` | 複数引数の受け渡しや分解束縛に使う固定長タプル |

### 値リストと `List` の違い

`(first, second)` は、実行時に `List` とは区別される値リスト（内部型 `Tuple`）です。複数の値をまとめて関数や標準処理へ渡すときや、分解束縛するときに使います。

* 関数・標準処理へ複数引数として展開されるのは**値リスト `(...)` だけ**です。
* ふつうの `List`（`[10, 20]`）を関数へ渡したときは展開されず、1 個の `List` 引数としてそのまま渡ります。
* 値リストに `List` 変換を使うと、同じ順番の `List` になります。`Type` を使うと `"Tuple"` を返します。

### リテラル

```
Digit          = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" .
NumLiteral     = Digit { Digit } [ "." Digit { Digit } ] .
BoolLiteral    = "true" | "false" .
NullLiteral    = "null" .
ListLiteral    = "[" [ Pipeline { "," Pipeline } [ "," ] ] "]" .
DictLiteral    = "{" [ StrLiteral ":" Pipeline
                 { "," StrLiteral ":" Pipeline } [ "," ] ] "}" .
ValueList      = "(" Pipeline "," Pipeline
                 { "," Pipeline } [ "," ] ")" .
StrLiteral     = InterpString | PlainString | RawString .
InterpString   = '"' { Char | Escape | "{{" | "}}" | "{" Expression "}" } '"' .
PlainString    = "'" { Char | Escape } "'" .
RawString      = "`" { Char } "`" .      (* 同じ行の中で閉じる。` そのものは入れられない *)
```

負の数は、数値リテラルに単項演算子 `-` を付けた式として評価します。

`List`・`Dict`・値リストの要素は、補助引数と同じく、かっこの中なので、パイプラインもそのまま書けます（`[1, 2 >> Str]` は `[1, "2"]`、`(i + 1, xs >> Append(i))`）。

```
-42 >> negative.
[1, 2, 3] >> numbers.
{"name": "Ada", "active": true} >> user.
```

`Dict` のキーは `Str` です。`value::field` という書き方は、`Str` キー `"field"` を取り出す短縮表記です。

### 等価性

`==` は型と中身を比べます。`1` と `1.0` はどちらも同じ `Num` の値なので `1 == 1.0` は `true` です。一方で `Bool` は数値と区別するため、`true == 1` は `false` です。`List` と値リストは、同じ型・同じ長さで、すべての位置の値が等しいときに等しくなります。`Dict` は挿入順に関係なく、同じキーを持ち、それぞれの値が等しいときに等しくなります。比較結果は `Bool` です。

### `Type` と型変換

`Type` は次のいずれかの `Str` を返します。

```
Null  Bool  Num  Str  List  Dict  Tuple
```

標準の型処理は次のとおりです。

| 処理 | 意味 |
|---|---|
| `Num` | 変換できる値を数値（`Num`）にします |
| `Str` | 値を規定の形式の文字列（`Str`）にします |
| `List` | `List` はそのまま返し、値リスト（`Tuple`）は `List` に変換します。それ以外は `TypeError` |
| `Dict` | 値が `Dict` であることを確かめてそのまま返します。それ以外は `TypeError` |
| `Type` | PopCorn の型名を返します |
| `Bool` | 厳格なルールで `Bool` に変換します |

`Num` は、`Num` をそのまま返し、10進数を表す `Str` を `Num` へ変換します。`Bool` は `Num` の入力には使えません。

`Bool` が受け付けるのは `true`、`false`、数値の `1`、数値の `0` だけです。`1` は `true`、`0` は `false` になります。それ以外の値（`"false"` や `2` など）を渡すと `TypeError` になります。

```
1 >> Bool.        // true
0 >> Bool.        // false
```

### `Str` 変換の出力ルール

どの処理系でも同じ結果になるよう、`Str` 変換と文字列補間 `{式}` の出力形式を次のように決めています。

| 入力型 | `Str` 変換結果の例 | ルール |
|---|---|---|
| `Null` | `"null"` | 固定文字列 `"null"` |
| `Bool` | `"true"` / `"false"` | 固定文字列 |
| `Num` | `"42"`、`"3.14"`、`"0.000001"`、`"1e+22"` | 小数部がない整数値は `"42"` のように小数点なしで表記し、小数は元の値に戻せるいちばん短い10進表記にします。絶対値が `1e-6` 以上 `1e21` 未満なら指数を使わずに書き（`0.000001`）、それ以外は `1e-7`、`1.5e+22` のように指数で書きます（JavaScript の数の表記と同じです） |
| `Str` | そのまま | 元の文字列をそのまま返します |
| `List` | `"[1, 2, 3]"` | JSON 互換表記（要素の間は `, `） |
| `Dict` | `'{"name": "Ada"}'` | JSON 互換表記（挿入順を保ち、`: ` と `, ` で区切ります） |
| 値リスト | `"(1, 2)"` | 丸括弧表記（要素の間は `, `） |

### 標準関数一覧

標準関数は、左のパイプから現在値を受け取り、結果を次の段階へ渡します。複数入力をとる関数は、値リスト `(a, b) >> Func` でも、パイプ追加引数 `a >> Func(b)` でも呼び出せます（詳しくは第4節を見てください）。

表の「非破壊」は、渡された `List`・`Dict`・`Str` を変えずに新しい値を返すことを表します。「外部効果」は、画面・時間・入出力・ネットワーク・ファイルへ働きかける処理です。入力の形や型が合わない場合は、特記がない限り `TypeError` になります。

| 分類 | 処理 | 入力 | 結果とルール |
|---|---|---|---|
| 型 | `Type` | 任意の値 | PopCorn の型名を返します。 |
| 型 | `Num` | 数値に変換できる値 | `Num` を返します。変換できない場合は `TypeError`。 |
| 型 | `Str` | 任意の値 | 規定の文字列表現を返します。 |
| 型 | `List` | `List` または値リスト | `List` を返します。それ以外は `TypeError`。 |
| 型 | `Dict` | `Dict` | 同じ `Dict` を返します。`Dict` 以外は `TypeError`。 |
| 型 | `Bool` | `true`、`false`、`0`、`1` | 厳格な `Bool` 変換を行います。それ以外は `TypeError`。 |
| ストリーム | `Map` | `List` と要素用ブロック | 各要素にブロックを適用した新しい `List` を返します。 |
| ストリーム | `Filter` | `List` と `Bool` 用ブロック | ブロックが `true` を返した要素だけを集めた新しい `List` を返します。 |
| ストリーム | `Count` | `List` と `Bool` 用ブロック | ブロックが `true` を返した要素の数を `Num` で返します。 |
| ストリーム | `Any` | `List` と、省略できる `Bool` 用ブロック | `true` を返す要素が 1 つでもあれば `true`。見つかったところで止めます。空 `List` は `false`。ブロックを省くと、要素そのもの（`Bool`）を調べます。 |
| ストリーム | `All` | `List` と、省略できる `Bool` 用ブロック | すべての要素で `true` なら `true`。`false` が見つかったところで止めます。空 `List` は `true`。ブロックを省くと、要素そのもの（`Bool`）を調べます。 |
| ストリーム | `Reduce` | `List`、任意の初期値、集約用ブロック | 初期値があれば空 `List` で初期値を返します。初期値がなければ先頭要素を初期値とし、空 `List` は `RuntimeError`。 |
| ストリーム | `Sort` | `List` と、省略できるキー用ブロック | キーを使って昇順で安定ソートした新しい `List` を返します。キーを省くと要素そのものをキーにします（`[3, 1, 2] >> Sort`）。 |
| ストリーム | `SortDesc` | `List` と、省略できるキー用ブロック | キーを使って降順で安定ソートした新しい `List` を返します。キーを省くと要素そのものをキーにします。 |
| ストリーム | `Group` | `List` と `Str` キー用ブロック | キーごとの `List` をまとめた `Dict` を返します。 |
| ストリーム | `Fork` | 任意の値と複数の分岐 | ラベルなしなら宣言順の `List`、ラベル付きなら `Dict` を返します。 |
| ストリーム | `Update` | `Dict` と更新用ブロック | 指定フィールド（`@::a::b` のような入れ子も可）を更新した新しい `Dict` を返します。 |
| ストリーム | `Check` | 任意の値と `when` / `else` 分岐 | 最初に `true` になった分岐の値を返します。 |
| ストリーム | `Loop` | 任意の状態値と反復用ブロック | `Break` まで状態値を更新し続け、`Break` に渡した値を返します。 |
| ストリーム | `Try` / `Catch` | 任意の値と本体・捕捉ブロック | 本体でエラーが起きたとき、`Catch` で受け取って回復値を返します。 |
| 数値 | `Add` | `(left, right)` | 2つの値を `+` で足すか連結します。 |
| 数値 | `Div` | `(left, right)` | 2つの整数値（小数部のない `Num`）を 0 の方向へ切り捨てて整数除算した `Num` を返します。0 除算は `RuntimeError`。 |
| 数値 | `Sum` | 数値だけの `List` または値リスト | 合計を返します。空 `List` は `0`。 |
| 数値 | `Average` | 数値だけの空でない `List` または値リスト | 平均を `Num` で返します。空 `List` は `RuntimeError`。 |
| 数値 | `Max` | 数値だけ、または `Str` だけの、空でない `List` または値リスト | 最大値を返します。`(3, 5) >> Max` や `3 >> Max(5)` のように、値リストでも書けます。空 `List` は `RuntimeError`。 |
| 数値 | `Min` | 数値だけ、または `Str` だけの、空でない `List` または値リスト | 最小値を返します。`(3, 5) >> Min` や `3 >> Min(5)` のように、値リストでも書けます。空 `List` は `RuntimeError`。 |
| 数値 | `Round` | `Num` または `(x, digits)` | いちばん近い整数値の `Num` を返します。中間値（`.5`）は 0 から遠い方向へ丸めます（四捨五入）。`x >> Round(digits)` と書くと、小数第 `digits` 位までに丸めます（`3.14159 >> Round(2)` は `3.14`）。`digits` が負なら整数の位で丸めます（`1234 >> Round(-2)` は `1200`）。`digits` は整数値の `Num` で、そうでなければ `TypeError`。 |
| 数値 | `Abs` | `Num` | 絶対値の `Num` を返します。 |
| 数値 | `Fixed` | `(x, digits)` | `x` を小数第 `digits` 位まで四捨五入（`Round` と同じ）し、足りない桁を `0` で補った `Str` を返します（`3.1 >> Fixed(2)` は `"3.10"`、`5 >> Fixed(0)` は `"5"`）。`digits` は 0 から 100 の整数値の `Num`。値の表示をそろえるときに使います。 |
| 数値 | `Floor` | `Num` または `(x, digits)` | 小数点以下を負の方向へ切り捨てた、整数値の `Num` を返します（`-3.2` は `-4`）。`x >> Floor(digits)` と書くと、`Round` と同じ桁の数え方で切り捨てます（`3.14159 >> Floor(2)` は `3.14`）。 |
| 数値 | `Ceil` | `Num` または `(x, digits)` | 小数点以下を正の方向へ切り上げた、整数値の `Num` を返します（`-3.7` は `-3`）。`x >> Ceil(digits)` と書くと、`Round` と同じ桁の数え方で切り上げます（`3.14159 >> Ceil(2)` は `3.15`）。 |
| 数値 | `Sqrt` | `Num`（0 以上） | 平方根の `Num` を返します。負の値は `RuntimeError`。 |
| 数値 | `Pow` | `(base, exponent)` | `base` の `exponent` 乗の `Num` を返します。結果が定まらないとき（負の数の小数乗、`0` の負の累乗）や、大きすぎるときは `RuntimeError`。 |
| 数値 | `Exp` | `Num` | `e` の累乗（自然指数関数）の `Num` を返します。大きすぎるときは `RuntimeError`。 |
| 数値 | `Log` | `Num`（0 より大きい）または `(x, base)` | 自然対数の `Num` を返します。`x >> Log(base)` と書くと、`base` を底にした対数です。`x` が 0 以下のとき、`base` が 0 以下か 1 のときは `RuntimeError`。 |
| 数値 | `Sin` | `Num`（ラジアン） | 正弦の `Num` を返します。 |
| 数値 | `Cos` | `Num`（ラジアン） | 余弦の `Num` を返します。 |
| 数値 | `Tan` | `Num`（ラジアン） | 正接の `Num` を返します。 |
| 数値 | `Pi` | 入力は使いません | 円周率 `3.14159…` の `Num` を返します。`Pi * 2` のように、処理名だけで書けます。 |
| 数値 | `E` | 入力は使いません | ネイピア数 `2.71828…` の `Num` を返します。処理名だけで書けます。 |
| 数値 | `Random` | `(minimum, maximum)` の 2つの整数値（`Num`） | 両端を含む範囲からランダムな整数値の `Num` を返します。`minimum > maximum` は `RuntimeError`。外部効果あり。 |
| 数値 | `Range` | `(start, end)` の 2つの整数値（`Num`） | `start` から `end` まで（両端を含む）の `Num` の `List` を返します。`start > end` なら空 `List` `[]`。 |
| 数値 | `Sign` | `Num` | 正なら `1`、負なら `-1`、`0` なら `0` を返します。例：`-8 >> Sign` は `-1`。 |
| 数値 | `Trunc` | `Num` | 小数点以下を 0 に近い方向へ切り捨てた、整数値の `Num` を返します（`-3.7` は `-3`）。例：`-3.7 >> Trunc` は `-3`。 |
| 数値 | `Clamp` | `(x, min, max)` | `x` を `min` 以上 `max` 以下に収めた `Num` を返します。`min > max` は `RuntimeError`。例：`15 >> Clamp(0, 10)` は `10`。 |
| 数値 | `Between` | `(x, min, max)` | `x` が `min` 以上 `max` 以下なら `true` を返します。例：`5 >> Between(1, 10)` は `true`。 |
| 数値 | `Mod` | `(a, b)` | `a` を `b` で割った余りを、`b` が正なら 0 以上で返します（`-1 >> Mod(5)` は `4`）。`b` が 0 は `RuntimeError`。例：`-1 >> Mod(5)` は `4`。 |
| 数値 | `Gcd` | `(a, b)` の 2つの整数値 | 最大公約数の `Num` を返します。例：`(12, 18) >> Gcd` は `6`。 |
| 数値 | `Lcm` | `(a, b)` の 2つの整数値 | 最小公倍数の `Num` を返します。どちらかが `0` なら `0`。例：`(4, 6) >> Lcm` は `12`。 |
| 数値 | `Factorial` | 0 から 170 までの整数値 | 階乗の `Num` を返します（`5 >> Factorial` は `120`）。範囲の外は `RuntimeError`。例：`5 >> Factorial` は `120`。 |
| 数値 | `Product` | `Num` の `List` | すべてを掛けた `Num` を返します。空の `List` は `1`。例：`[2, 3, 4] >> Product` は `24`。 |
| 数値 | `Median` | 空でない `Num` の `List` | 中央値の `Num` を返します。個数が偶数なら、まん中 2つの平均です。例：`[5, 1, 3] >> Median` は `3`。 |
| 数値 | `Mode` | 空でない `List` | いちばん多く現れる要素を返します。同数なら、先に現れた方です。例：`[1, 2, 2, 3, 3] >> Mode` は `2`。 |
| 数値 | `Variance` | 空でない `Num` の `List` | 分散（母集団。平均からのずれの 2 乗の平均）の `Num` を返します。例：`[1, 2, 3, 4, 5] >> Variance` は `2`。 |
| 数値 | `StdDev` | 空でない `Num` の `List` | 標準偏差（母集団。`Variance` の平方根）の `Num` を返します。例：`[2, 4, 4, 4, 5, 5, 7, 9] >> StdDev` は `2`。 |
| 数値 | `Cumulative` | `Num` の `List` | ここまでの合計を並べた `List` を返します（`[1, 2, 3]` は `[1, 3, 6]`）。例：`[1, 2, 3, 4] >> Cumulative` は `[1, 3, 6, 10]`。 |
| 数値 | `Atan` | `Num` | 逆正接（ラジアン）の `Num` を返します。例：`1 >> Atan >> Degrees >> Round` は `45`。 |
| 数値 | `Asin` | -1 から 1 の `Num` | 逆正弦（ラジアン）の `Num` を返します。範囲の外は `RuntimeError`。例：`1 >> Asin >> Degrees` は `90`。 |
| 数値 | `Acos` | -1 から 1 の `Num` | 逆余弦（ラジアン）の `Num` を返します。範囲の外は `RuntimeError`。例：`0 >> Acos >> Degrees` は `90`。 |
| 数値 | `Atan2` | `(y, x)` | 原点から `(x, y)` への角度（ラジアン）の `Num` を返します。例：`(1, 1) >> Atan2 >> Degrees >> Round` は `45`。 |
| 数値 | `Degrees` | `Num`（ラジアン） | ラジアンを度にした `Num` を返します。例：`Pi >> Degrees` は `180`。 |
| 数値 | `Radians` | `Num`（度） | 度をラジアンにした `Num` を返します。例：`180 >> Radians >> Round(5)` は `3.14159`。 |
| 数値 | `Hypot` | `(a, b)` | 直角三角形の斜辺（`a` と `b` の 2 乗の和の平方根）の `Num` を返します。例：`(3, 4) >> Hypot` は `5`。 |
| 数値 | `Cbrt` | `Num` | 立方根の `Num` を返します。負の数も使えます（`-8` は `-2`）。例：`27 >> Cbrt >> Round` は `3`。 |
| 数値 | `IsPrime` | 0 以上の整数値（10^12 まで） | 素数なら `true` を返します。例：`97 >> IsPrime` は `true`。 |
| 数値 | `ToBase` | `(n, base)` | 整数値 `n` を `base` 進数（2 から 36）の `Str` にします（`255 >> ToBase(16)` は `"ff"`）。例：`255 >> ToBase(16)` は `"ff"`。 |
| 数値 | `FromBase` | `(text, base)` | `base` 進数（2 から 36）で書かれた `Str` を、`Num` にします。読めないときは `RuntimeError`。例：`"ff" >> FromBase(16)` は `255`。 |
| 文字列 | `Uppercase` | `Str` | 大文字にした新しい `Str` を返します。非破壊。 |
| 文字列 | `Lowercase` | `Str` | 小文字にした新しい `Str` を返します。非破壊。 |
| 文字列 | `Trim` | `Str` | 前後の空白（全角の空白も）を取り除いた新しい `Str` を返します。非破壊。 |
| 文字列 | `Split` | `(text, delimiter)` | 区切り文字で分けた `Str` の `List` を返します。 |
| 文字列 | `Replace` | `(text, old, new)` | 置換後の新しい `Str` を返します。非破壊。 |
| 文字列 | `Join` | `(items, delimiter)` | `List` の各要素を `Str` 変換してつないだ `Str` を返します。 |
| 文字列 | `Format` | `(template, value, ...)` | `{0}`、`{1}` などの位置プレースホルダに、値を `Str` 変換して埋め込んだ `Str` を返します。`{{` と `}}` は、`{` と `}` になります。値の足りないプレースホルダは `IndexError`。`"…"` の中でも `{0}` のような数字だけの `{ }` は補間されないので、どの種類の文字列でも書けます（7章）。ふだんは `{式}` 補間を使うのがおすすめです。 |
| 文字列 | `StartsWith` | `(text, prefix)` | `text` が `prefix` で始まれば `true` を返します。 |
| 文字列 | `EndsWith` | `(text, suffix)` | `text` が `suffix` で終われば `true` を返します。 |
| 文字列 | `PadStart` | `(text, width)` または `(text, width, fill)` | `text` の前を `fill`（1 文字。省くと空白）で埋めて、長さ `width` にした `Str` を返します（`"5" >> PadStart(3, "0")` は `"005"`）。もとから `width` 以上なら、そのまま返します。`Num` は先に `Str` で変換します。 |
| 文字列 | `PadEnd` | `(text, width)` または `(text, width, fill)` | `PadStart` と同じで、うしろを埋めます。 |
| 文字列 | `Match` | `(text, pattern)` | `text` の中に、正規表現 `pattern` に合う部分があれば `true` を返します。 |
| 文字列 | `FindAll` | `(text, pattern)` | 正規表現 `pattern` に合う部分を、前から重ならないように探し、合った文字列の `List` を返します。 |
| 文字列 | `ReplaceAll` | `(text, pattern, replacement)` | 正規表現 `pattern` に合う部分を、すべて `replacement` に置き換えた `Str` を返します。`replacement` の中の `$1`、`$2` はグループに合った文字列、`$$` は `$` そのものです。 |
| 文字列 | `Capitalize` | `Str` | 最初の 1 文字を大文字、残りを小文字にした `Str` を返します。例：`"pOPCORN" >> Capitalize` は `"Popcorn"`。 |
| 文字列 | `TitleCase` | `Str` | 英単語の先頭を大文字、残りを小文字にした `Str` を返します。例：`"hello big world" >> TitleCase` は `"Hello Big World"`。 |
| 文字列 | `SwapCase` | `Str` | 大文字と小文字を入れ替えた `Str` を返します。例：`"Pop" >> SwapCase` は `"pOP"`。 |
| 文字列 | `TrimStart` | `Str` | 前の空白（全角の空白も）だけを取り除いた `Str` を返します。例：`"  hi  " >> TrimStart` は `"hi  "`。 |
| 文字列 | `TrimEnd` | `Str` | うしろの空白（全角の空白も）だけを取り除いた `Str` を返します。例：`"  hi  " >> TrimEnd` は `"  hi"`。 |
| 文字列 | `TrimPrefix` | `(text, prefix)` | `text` が `prefix` で始まるなら、それを取り除いた `Str` を返します。例：`"v1.2" >> TrimPrefix("v")` は `"1.2"`。 |
| 文字列 | `TrimSuffix` | `(text, suffix)` | `text` が `suffix` で終わるなら、それを取り除いた `Str` を返します。例：`"main.pop" >> TrimSuffix(".pop")` は `"main"`。 |
| 文字列 | `Lines` | `Str` | 行ごとに分けた `Str` の `List` を返します。例：`"a\nb\nc" >> Lines` は `["a", "b", "c"]`。 |
| 文字列 | `Words` | `Str` | 空白（全角の空白も）で区切った単語の `List` を返します。続く空白は 1 つとして扱います。例：`"  pop  corn  " >> Words` は `["pop", "corn"]`。 |
| 文字列 | `Chars` | `Str` | 1 文字ずつの `Str` の `List` を返します（コードポイント単位）。例：`"pop" >> Chars` は `["p", "o", "p"]`。 |
| 文字列 | `Center` | `(text, width)` または `(text, width, fill)` | `text` の両側を `fill`（1 文字。省くと空白）で埋めて、長さ `width` にした `Str` を返します。例：`"pop" >> Center(7, "*")` は `"**pop**"`。 |
| 文字列 | `Truncate` | `(text, length)` または `(text, length, suffix)` | `length` 文字までに切り詰めます。切ったときは、うしろに `suffix`（省くと `…`）を付けて、全体を `length` 文字に収めます。例：`"popcorn" >> Truncate(5)` は `"popc…"`。 |
| 文字列 | `Wrap` | `(text, width)` | 英語の文を、1 行が `width` 文字までになるように折り返して、行の `List` を返します。例：`"the quick brown fox" >> Wrap(10)` は `["the quick", "brown fox"]`。 |
| 文字列 | `IsBlank` | `Str` | 空、または空白（全角の空白も）だけなら `true` を返します。例：`"  " >> IsBlank` は `true`。 |
| 文字列 | `Occurrences` | `(text, part)` | `part` が `text` に、重ならずに何回現れるかを `Num` で返します。`part` は空でない `Str`。例：`"banana" >> Occurrences("an")` は `2`。 |
| 文字列 | `CodePoint` | 1 文字の `Str` | その文字のコードポイントの `Num` を返します（`"A"` は `65`）。例：`"A" >> CodePoint` は `65`。 |
| 文字列 | `FromCodePoint` | 整数値 | コードポイントの文字 1 つの `Str` を返します（`65` は `"A"`）。例：`65 >> FromCodePoint` は `"A"`。 |
| 文字列 | `SnakeCase` | `Str` | `snake_case`（小文字を `_` でつなぐ書き方）にした `Str` を返します。例：`"helloBigWorld" >> SnakeCase` は `"hello_big_world"`。 |
| 文字列 | `KebabCase` | `Str` | `kebab-case`（小文字を `-` でつなぐ書き方）にした `Str` を返します。例：`"helloBigWorld" >> KebabCase` は `"hello-big-world"`。 |
| 文字列 | `CamelCase` | `Str` | `camelCase`（2 語目から先頭を大文字にしてつなぐ書き方）にした `Str` を返します。例：`"hello big_world" >> CamelCase` は `"helloBigWorld"`。 |
| 文字列 | `Distance` | `(a, b)` の 2つの `Str` | 2つの文字列が何文字ちがうかを表す、編集距離（レーベンシュタイン距離）の `Num` を返します。例：`("kitten", "sitting") >> Distance` は `3`。 |
| コレクション | `Length` | `List`、`Dict`、`Str`、値リスト | 要素数、キー数、または Unicode コードポイント数を `Num` で返します。 |
| コレクション | `Reverse` | `List` または `Str` | 逆順にした新しい `List` または `Str`（コードポイント単位）を返します。非破壊。 |
| コレクション | `Get` | `(target, key)` または `(target, key, default)` | `List`・`Str` の添字（負ならうしろから。`Str` は 1 文字の `Str`）や `Dict` のキーに対応する値を返します。見つからないとき（`target` が `null` のときも）、`default` があればそれを返し、なければ `IndexError` / `KeyError`。 |
| コレクション | `First` | 空でない `List` または `Str` | 最初の要素（`Str` なら最初の 1 文字）を返します。空なら `IndexError`。 |
| コレクション | `Last` | 空でない `List` または `Str` | 最後の要素（`Str` なら最後の 1 文字）を返します。空なら `IndexError`。 |
| コレクション | `IndexOf` | `(list, item)` または `(text, part)` | `item`（`==` で等しい値）や部分文字列が最初に現れる位置を `Num` で返します。見つからなければ `null`（`-1` はうしろからの添字と紛らわしいため使いません）。 |
| コレクション | `Set` | `(target, key, value)` | `List` の要素（負の添字はうしろから）や `Dict` のフィールドを置き換えた新しい値を返します。非破壊。 |
| コレクション | `Remove` | `(dict, key)` または `(list, index)` | `Dict` は指定キーを取り除いた新しい `Dict` を返します（存在しないキーでもエラーにならず複製を返します）。`List` は添字の位置（負ならうしろから）の要素を取り除いた新しい `List` を返し、範囲外は `IndexError`。非破壊。 |
| コレクション | `Keys` | `Dict` | 挿入順のキー（`Str`）の `List` を返します。 |
| コレクション | `Values` | `Dict` | 挿入順の値の `List` を返します。 |
| コレクション | `Entries` | `Dict` | 挿入順の `[key, value]` の `List` を返します。 |
| コレクション | `Merge` | `(left, right)` | 2つの `Dict` を左から右へ合わせた新しい `Dict` を返します。同じキーは右側が優先されます。 |
| コレクション | `Contains` | `(target, item)` | `List` の要素、`Dict` の `Str` キー、`Str` の部分文字列を探して `Bool` を返します。 |
| コレクション | `Append` | `(items, item)` | `item` を末尾に追加した新しい `List` を返します。非破壊。 |
| コレクション | `Prepend` | `(items, item)` | `item` を先頭に追加した新しい `List` を返します。非破壊。 |
| コレクション | `Insert` | `(items, index, item)` | `index` の位置に `item` を差し込んだ新しい `List` を返します。`index` は `0` から長さまで、負なら `-1` が末尾（`Append` と同じ位置）です。範囲外は `IndexError`。非破壊。 |
| コレクション | `Repeat` | `(target, count)` | `Str` または `List` を `count` 回くり返してつないだ新しい値を返します（`"ab" >> Repeat(3)` は `"ababab"`）。`count` は 0 以上の整数値の `Num`。 |
| コレクション | `Slice` | `(target, end)` または `(target, start, end)` | 範囲を切り出した新しい `List` または `Str`（コードポイント単位）を返します。終端 `end` は含みません。負の添字はうしろから数えます（`[1, 2, 3] >> Slice(-1)` は `[1, 2]`、`"hello" >> Slice(-3, -1)` は `"ll"`）。長さをはみ出した範囲は、ある分だけを返します（`"abc" >> Slice(0, 10)` は `"abc"`）。うしろから数えたあとで `start > end` になるときは `IndexError`。 |
| コレクション | `Array` | 非負の整数値（`Num`）の `size` またはサイズの `List` | 指定した各次元を `0` で埋めた新しい `List` を返します。 |
| コレクション | `Zip` | 空でない `List` 群（値リスト） | 同じ位置の要素どうしを `List` にまとめた `List` を返します。いちばん短い入力の長さで止まります。 |
| コレクション | `Unique` | `List` | 同じ値（`==` で等しい値）の 2 つ目以降を取り除いた、新しい `List` を返します。最初に現れた順を保ちます。非破壊。 |
| コレクション | `Flatten` | `List` | 要素が `List` のものを 1 段だけ展開した、新しい `List` を返します（`[[1, 2], 3]` は `[1, 2, 3]`）。`List` でない要素は、そのまま残ります。非破壊。 |
| コレクション | `Enumerate` | `List` | 0 から数えた番号つきの `[index, item]` の `List` を返します。 |
| コレクション | `FromEntries` | `[key, value]` の `List` | `Entries` の逆です。`Dict` を返します。`key` は `Str`。同じ `key` が複数あるときは、後のものが勝ちます。 |
| コレクション | `GetPath` | `(target, path)` または `(target, path, default)` | 深い `Dict` / `List` の中身を、`path`（`Str` のキーと整数値の添字の `List`）でたどって返します。途中で見つからなければ、エラーにせず `default`（なければ `null`）を返します。 |
| コレクション | `Take` | `(target, n)` | `List` または `Str` の、前から `n` 個を返します。足りなければ全部です。例：`[1, 2, 3, 4] >> Take(2)` は `[1, 2]`。 |
| コレクション | `Drop` | `(target, n)` | `List` または `Str` の、前から `n` 個を除いた残りを返します。例：`[1, 2, 3, 4] >> Drop(2)` は `[3, 4]`。 |
| コレクション | `TakeLast` | `(target, n)` | `List` または `Str` の、うしろから `n` 個を返します。例：`[1, 2, 3, 4] >> TakeLast(2)` は `[3, 4]`。 |
| コレクション | `Chunk` | `(items, size)` | `size` 個ずつに区切った `List` の `List` を返します。最後は短くなることがあります。例：`[1, 2, 3, 4, 5] >> Chunk(2)` は `[[1, 2], [3, 4], [5]]`。 |
| コレクション | `Sliding` | `(items, size)` | `size` 個ぶんの窓を 1 つずつずらして並べた、`List` の `List` を返します。例：`[1, 2, 3, 4] >> Sliding(2)` は `[[1, 2], [2, 3], [3, 4]]`。 |
| コレクション | `Rotate` | `(items, n)` | 前から `n` 個を、うしろへ回した `List` を返します。負の数は逆向きです。例：`[1, 2, 3, 4] >> Rotate(1)` は `[2, 3, 4, 1]`。 |
| コレクション | `Compact` | `List` | `null` を取り除いた新しい `List` を返します。例：`[1, null, 2, null] >> Compact` は `[1, 2]`。 |
| コレクション | `Union` | `(a, b)` の 2つの `List` | どちらかにある要素を、重ならないように並べた `List` を返します。例：`([1, 2], [2, 3]) >> Union` は `[1, 2, 3]`。 |
| コレクション | `Intersect` | `(a, b)` の 2つの `List` | 両方にある要素を、重ならないように並べた `List` を返します。例：`([1, 2, 3], [2, 3, 4]) >> Intersect` は `[2, 3]`。 |
| コレクション | `Difference` | `(a, b)` の 2つの `List` | `a` にあって `b` にない要素の `List` を返します。例：`([1, 2, 3, 4], [2, 4]) >> Difference` は `[1, 3]`。 |
| コレクション | `Transpose` | 同じ長さの `List` の `List` | 行と列を入れ替えた `List` の `List` を返します。例：`[[1, 2, 3], [4, 5, 6]] >> Transpose` は `[[1, 4], [2, 5], [3, 6]]`。 |
| コレクション | `Cartesian` | `(a, b)` の 2つの `List` | `a` と `b` のすべての組み合わせ `[x, y]` を並べた `List` を返します。例：`([1, 2], ["a", "b"]) >> Cartesian` は `[[1, "a"], [1, "b"], [2, "a"], [2, "b"]]`。 |
| コレクション | `Combinations` | `(items, k)` | `items` から `k` 個を選ぶ組み合わせ（順番は区別しない）を、すべて並べた `List` を返します。10 万通りまで。例：`[1, 2, 3] >> Combinations(2)` は `[[1, 2], [1, 3], [2, 3]]`。 |
| コレクション | `Shuffle` | `List` | ランダムに並べかえた新しい `List` を返します。外部効果あり（結果が毎回ちがう）。例：`[1, 2, 3, 4] >> Shuffle >> Sort` は `[1, 2, 3, 4]`。 |
| コレクション | `Sample` | `(items, n)` | `items` から、重ならないように `n` 個をランダムに選んだ `List` を返します。外部効果あり。例：`[1, 2, 3, 4] >> Sample(2) >> Length` は `2`。 |
| コレクション | `Tally` | `List` | 同じ値が何個あるかを数えた `Dict`（キーは `Str` 変換した値）を返します。例：`["a", "b", "a"] >> Tally` は `{"a": 2, "b": 1}`。 |
| コレクション | `CountOf` | `(items, item)` | `items` の中に `item`（`==` で等しい値）が何個あるかを `Num` で返します。例：`[1, 2, 1, 1] >> CountOf(1)` は `3`。 |
| コレクション | `IsEmpty` | `List`、`Dict`、`Str`、または `null` | 空（または `null`）なら `true` を返します。例：`[] >> IsEmpty` は `true`。 |
| コレクション | `Pick` | `(dict, keys)` | `keys`（`Str` の `List`）にあるキーだけを残した新しい `Dict` を返します。例：`{"a": 1, "b": 2, "c": 3} >> Pick(["a", "c"])` は `{"a": 1, "c": 3}`。 |
| コレクション | `Omit` | `(dict, keys)` | `keys`（`Str` の `List`）にあるキーを除いた新しい `Dict` を返します。例：`{"a": 1, "b": 2, "c": 3} >> Omit(["b"])` は `{"a": 1, "c": 3}`。 |
| コレクション | `Invert` | `Dict`（値が `Str`・`Num`・`Bool`） | キーと値を入れ替えた `Dict` を返します。同じ値が複数あるときは、後のキーが勝ちます。例：`{"a": "x", "b": "y"} >> Invert` は `{"x": "a", "y": "b"}`。 |
| コレクション | `DeepMerge` | `(left, right)` の 2つの `Dict` | 中の `Dict` まで、再帰的に合わせた新しい `Dict` を返します。同じキーは右側が優先されます。例：`({"a": {"x": 1, "y": 2}}, {"a": {"y": 3}}) >> DeepMerge` は `{"a": {"x": 1, "y": 3}}`。 |
| コレクション | `SetPath` | `(target, path, value)` | `GetPath` と同じ `path`（`Str` のキーと整数値の添字の `List`）の先を `value` に替えた、新しい値を返します。最後のキーだけは、新しくてもかまいません。例：`{"a": {"b": 1}} >> SetPath(["a", "c"], 2)` は `{"a": {"b": 1, "c": 2}}`。 |
| JSON | `ToJson` | JSON にできる値 | JSON 文字列を返します。 |
| JSON | `FromJson` | JSON 文字列 | JSON を PopCorn の値に変換します。壊れた JSON は `RuntimeError`。 |
| 時間 | `Now` | 入力は使いません | 現在日時を `year`・`month`・`day`・`hour`・`minute`・`second`・`millisecond`・`weekday`（`0` が日曜、`6` が土曜）・`timestamp`（1970-01-01 00:00 UTC からの秒数。小数つき）を持つ `Dict` で返します。かかった時間は、2 つの `timestamp` の差で測れます。外部効果あり。 |
| 時間 | `Sleep` | 秒数を表す `Num`、または `(value, seconds)` | 指定した秒数だけ待ちます。`seconds >> Sleep` は秒数を、`value >> Sleep(seconds)` は `value` をそのまま返すので、パイプラインの途中に挟めます。負の値は `RuntimeError`。外部効果あり。 |
| 時間 | `Date` | `(year, month, day)` または `(year, month, day, hour, minute, second)` | UTC のその日時の `timestamp`（秒数の `Num`）を返します。存在しない日付は `RuntimeError`。例：`(2026, 11, 27) >> Date >> FormatDate("YYYY-MM-DD")` は `"2026-11-27"`。 |
| 時間 | `DateParts` | `timestamp` | `Now` と同じ形の `Dict`（`year`・`month`・`day`・`hour`・`minute`・`second`・`weekday`・`timestamp`）を UTC で返します。例：`0 >> DateParts >> Get("year")` は `1970`。 |
| 時間 | `FormatDate` | `(timestamp, pattern)` | `timestamp` を UTC で `pattern` に当てはめた `Str` を返します。使える印は `YYYY` `YY` `MM` `DD` `HH` `mm` `ss`。例：`0 >> FormatDate("YYYY/MM/DD HH:mm:ss")` は `"1970/01/01 00:00:00"`。 |
| 時間 | `ParseDate` | `Str`（`2026-11-27` または `2026-11-27 12:30:00`） | UTC の `timestamp` にして返します。読めない書き方や存在しない日付は `RuntimeError`。例：`"1970-01-02" >> ParseDate` は `86400`。 |
| 時間 | `AddDays` | `(timestamp, days)` | `days` 日あとの `timestamp` を返します。負の数は前の日です。例：`(0, 2) >> AddDays` は `172800`。 |
| 時間 | `AddMonths` | `(timestamp, months)` | `months` か月あとの `timestamp` を返します。日が存在しなければ、その月の最後の日にします（1/31 の 1 か月後は 2/28 か 2/29）。例：`("2026-01-31" >> ParseDate, 1) >> AddMonths >> FormatDate("YYYY-MM-DD")` は `"2026-02-28"`。 |
| 時間 | `DiffDays` | `(from, to)` の 2つの `timestamp` | `from` から `to` までの日数の `Num` を返します（`to` が後なら正）。端数は小数です。例：`(0, 172800) >> DiffDays` は `2`。 |
| 時間 | `Weekday` | `timestamp` | UTC での曜日を `Num` で返します（`0` が日曜、`6` が土曜）。例：`"2026-11-27" >> ParseDate >> Weekday` は `5`。 |
| 時間 | `DaysInMonth` | `(year, month)` | その月の日数の `Num` を返します。例：`(2024, 2) >> DaysInMonth` は `29`。 |
| 時間 | `IsLeapYear` | 年（整数値） | うるう年なら `true` を返します。例：`2024 >> IsLeapYear` は `true`。 |
| 入出力 | `Display` | 任意の値 | 値を `Str` 変換して表示し、元の値をそのまま返します。外部効果あり。 |
| 入出力 | `Input` | 表示するプロンプト（`Str`） | ユーザーが入力した `Str` を返します。外部効果あり。 |
| 入出力 | `Debug` | 任意の値 | デバッグ用に型と値を表示し、元の値をそのまま返します。外部効果あり。パイプラインの途中では、場所も表示する `>?>` が便利です（4章）。 |
| 入出力 | `ReadFile` | ファイルパスを表す `Str` | ローカルファイルの中身を UTF-8 の `Str` で返します。失敗時は `IOError`。外部効果あり。 |
| 入出力 | `WriteFile` | `(content, path)` | 内容をファイルへ書き込み、`content` をそのまま返します。失敗時は `IOError`。外部効果あり。 |
| 入出力 | `Fetch` | URL を表す `Str` | HTTP GET の応答本文を `Str` で返します。通信失敗や 4xx/5xx は `NetworkError`。外部効果あり。 |
| 入出力 | `Env` | 環境変数の名前（`Str`） | その値の `Str` を返します。設定されていなければ `null`。ブラウザの Playground には環境変数がないので、いつも `null` です。外部効果あり。 |
| 入出力 | `Args` | 入力は使いません | コマンドラインで、ファイル名のあとに書いた引数の `Str` の `List` を返します（`popcorn script.pop a b` なら `["a", "b"]`）。Playground では、いつも `[]` です。外部効果あり。 |
| 入出力 | `PostFetch` | `(body, url)` または `(body, url, headers)` | HTTP POST を送り、応答本文を `Str` で返します。`headers` を省くと `{}` になります。通信失敗や 4xx/5xx は `NetworkError`。外部効果あり。 |
| 入出力 | `HttpRequest` | `(method, url, headers, body)` | 任意の HTTP リクエストを送り、`{"status": Num, "headers": Dict, "body": Str}` を返します。通信できないときだけ `NetworkError`。外部効果あり。 |
| 制御 | `Return` | 任意の値 | いちばん内側の `pop` 関数を終わらせ、入力値を関数の結果にします。関数外では `RuntimeError`。 |
| 制御 | `Break` | 任意の値 | いちばん内側の `Loop` を終わらせ、入力値を `Loop` の結果にします。`Loop` 外では `RuntimeError`。 |
| エラー | `Throw` | 任意の値 | 入力値を `Str` 変換したメッセージで `UserError` を起こします。 |
| テスト | `Expect` | `(actual, expected)` または `(actual, expected, message)` | `actual == expected` なら `actual` をそのまま返します。ちがえば、期待した値と実際の値を示す `AssertionError` を起こします（17章）。 |
| テスト | `Assert` | `Bool` または `(condition, message)` | `true` なら `true` を返します。`false` なら `AssertionError`（`message` があれば、それを説明にします）。`Bool` 以外は `TypeError`。 |
| テスト | `ExpectError` | 任意の値と、丸括弧に書いた式（と、省略できるエラーの分類 `Str`） | 式を、入力値を `@` にして計算し、エラーになれば `{"type": Str, "message": Str}` を返します。エラーにならないときや、分類がちがうときは `AssertionError`（17章）。 |
| 値 | `Default` | `(value, fallback)` | `value` が `null` のときだけ `fallback` を返します。それ以外は `value` のままです（`0` や `""` もそのまま）。例：`null >> Default(5)` は `5`。 |
| 値 | `Coalesce` | 値リスト `(a, b, ...)` または `List` | 最初の `null` でない値を返します。すべて `null` なら `null`。例：`(null, null, 3, 4) >> Coalesce` は `3`。 |
| 値 | `IsNull` | 任意の値 | `null` なら `true` を返します。例：`null >> IsNull` は `true`。 |
| 値 | `Compare` | `(a, b)` の、どちらも `Num` か、どちらも `Str` | `a < b` なら `-1`、等しければ `0`、`a > b` なら `1` を返します。例：`(1, 2) >> Compare` は `-1`。 |
| 変換 | `ToCsv` | `List` の `List` | 行の `List` を CSV の `Str` にします。各値は `Str` 変換され、必要なら `"` で囲まれます。例：`[["a", "b"], [1, "x,y"]] >> ToCsv` は `"a,b\n1,\"x,y\""`。 |
| 変換 | `ParseCsv` | CSV の `Str` | 行ごとの `Str` の `List` の `List` にします。数も `Str` のままなので、必要なら `Num` で変換します。例：`"a,b\n1,2" >> ParseCsv` は `[["a", "b"], ["1", "2"]]`。 |
| 変換 | `Base64Encode` | `Str` | UTF-8 で Base64 にした `Str` を返します。例：`"popcorn" >> Base64Encode` は `"cG9wY29ybg=="`。 |
| 変換 | `Base64Decode` | Base64 の `Str` | Base64 を、UTF-8 の `Str` に戻します。読めないときは `RuntimeError`。例：`"cG9wY29ybg==" >> Base64Decode` は `"popcorn"`。 |
| 変換 | `UrlEncode` | `Str` | URL の中に置けるように、`%` 記号で書き換えた `Str` を返します。例：`"a b&c" >> UrlEncode` は `"a%20b%26c"`。 |
| 変換 | `UrlDecode` | `Str` | `%` 記号の書き方を、もとの文字に戻した `Str` を返します。例：`"a%20b%26c" >> UrlDecode` は `"a b&c"`。 |
| 変換 | `EscapeHtml` | `Str` | `<` `>` `&` `"` `'` を、HTML の中で安全な書き方に替えた `Str` を返します。例：`"<b>&</b>" >> EscapeHtml` は `"&lt;b&gt;&amp;&lt;/b&gt;"`。 |
| 変換 | `Sha256` | `Str` | UTF-8 にして SHA-256 を取った、16 進の `Str`（64 文字）を返します。例：`"abc" >> Sha256` は `"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"`。 |
| 変換 | `Uuid` | 入力は使いません | ランダムな UUID（`xxxxxxxx-xxxx-…` の `Str`）を返します。外部効果あり（毎回ちがう）。例：`null >> Uuid >> Length` は `36`。 |

## 4. パイプライン、束縛、パイプ追加引数

`>>` は左の値を右の処理へ渡す基本の演算子です。文の終わりに小文字の名前を書くと、現在値にその名前を付けます（束縛）。束縛したあとも、その段階の結果は現在値のままです。

```
[1, 2, 3] >> Max >> largest.
largest >> Display.
```

複数の値をまとめて渡すときは、値リストを使います。

```
(10, 20) >> values.
```

複数の名前へ一気に分ける（分解束縛）ときは `>> (left, right)` と書きます。右側の名前の数と、現在値（値リストまたは `List`）の要素数は同じにする必要があります。数が合わないと `RuntimeError` です。

### パイプ追加引数（糖衣構文）

複数の入力をとる標準関数やユーザー関数は、`>>` の右側に補助引数を丸括弧で添えて呼び出せます。

```
x >> Func(y, z)
```

これは、次の値リストを使った呼び出しとまったく同じ意味になります。

```
(x, y, z) >> Func
```

この書き方を使うと、パイプラインを途中で切らずに複数引数の関数をつなげられます。補助引数はかっこの中にあるので、それぞれにパイプラインを書けます（`word >> Slice((@ >> Length) - 1, @ >> Length)`）。

```
"a,b,c" >> Split(",") >> Join("-") >> Uppercase >> text.
{"name": "Ada"} >> Get("nickname", "名無し") >> name.
{"ok": true} >> ToJson >> PostFetch("https://example.com/api") >> response.
```

**注意点:** `Func(x, y)` のように `>>` なしで書くと、`@ >> Func(x, y)`（つまり `(@, x, y) >> Func`）の意味になります。次の「処理名だけで書く」を参照してください。

### 処理名だけで書く（`@` に適用）

式の中や文の先頭に、処理名だけを書くと、`@`（いまの値）を入力にして呼び出したものとして扱います。入力を使わない処理（`Pi`、`E`、`Now`、`Args`）を、`null >> Now` のように書かなくても、使えるようになります。

```
Pi * 2 >> Display.                       // (@ >> Pi) * 2
Now::year >> Display.                    // (@ >> Now)::year
Args >> Length >> count.                 // 引数の数
[[1, 2], [3]] >> Map:
    Length + 1.     // 各要素の長さ + 1  →  [3, 2]
Break when i >= n.                       // @ >> Break when …
```

* ブロックの中や関数の中では、`@` は、そのブロックや関数が受け取った入力値です。プログラムの最初の `@` は `null` です。
* `Map`、`Filter`、`Count`、`Any`、`All`、`Reduce`、`Sort`、`SortDesc`、`Group`、`Fork`、`Update`、`Check`、`Loop`、`Try`、`Catch` のように、ブロックが必要な処理は、この書き方では使えません。`>>` の右側に、ブロックつきで書きます（書くと「`>>` の右側で呼び出してください」というエラーです）。
* 入力が必要な処理の、値の書き忘れ（たとえば `Display.`）は、構文エラーにならず、`@` を入力にして実行されます。プログラムの最初で `Display.` と書くと、`null` を表示します。入力が必要な処理は、`>>` で入力を見せて書くことをおすすめします（付録 A）。

### 条件付き実行（後置 `when`）

文の末尾（`.` の直前）に `when 条件式` を添えると、条件が `true` のときだけその文を実行します。`false` のときはその文をスキップします（条件が `Bool` 以外の場合は `TypeError`）。`Loop` からの `Break` や関数からの `Return` を 1 行で書きたいときに便利です。

```
items >> Return when (items >> Length) <= 1.
arr >> Break when i >= n - 1.
```

### `:` と字下げで書くブロック

ブロック（関数定義、`Check` とその分岐、`Map` などのストリーム処理、`Loop`、`Try` / `Catch`、`Fork`、`Update` の本体）は、`:` と字下げで書きます。波括弧 `{ }` でブロックを書くことはできません（`{ }` は辞書リテラルだけに使います）。

```
(num) >> pop FizzBuzz:
    num >> Check:
        when num % 15 == 0: "FizzBuzz"
        when num % 3 == 0: "Fizz"
        when num % 5 == 0: "Buzz"
        else: num

(1, 20) >> Range >> Map (@ >> FizzBuzz) >> Display.
```

* `:` のブロックは、`:` のある行（見出しの行）の最初のトークンより、深く字下げされた行が続くあいだ続きます。見出しの行と同じか浅い行が来たところで、終わります。
* `Check` の分岐（`when …:` / `else:`）と関数定義（`pop 名前:`）だけは、`:` のすぐあと、同じ行に本体を書けます（`else: num`）。その場合も、次の行が見出しより深ければ、本体はそこまで続きます。
* `Map` などのストリーム処理や `Loop`、`Try` などは、本体を次の行から書きます。`[1, 2] >> Map: @ * 2 >> d.` のように同じ行に書くと、`>> d` まで本体に入ってしまうためです（エラーで案内します）。1 行で書きたいときは式渡し `Map (@ * 2)` を使います。
* 同じ行に書いた本体は、後置の `when` で終われません（`when a: "x" when b` は、2 つめの `when` が分岐に見えて紛らわしいため、エラーです）。
* ブロックの最後の文の `.` は省略できます。最後以外の文には `.` が必要です。
* 本体が空のブロックは書けません。受け取った値をそのまま返したいときは `@` と書きます。
* 丸括弧、角括弧、辞書の `{ }` の中では、行の字下げを見ません（複数行のリストや値リストは、自由に字下げできます）。閉じかっこが来ると、その中で開いた `:` のブロックは終わります。
* ブロックのあとの行を、見出しの行と同じ字下げで `>>` から始めると、外側のパイプラインが続きます。

```
[1, 2, 3] >> Map as x:
    x * 2
>> doubled.
```

* 1 行で短く書きたいときは、式渡し（`Map (@ * 2)`）や処理名渡し（`Map Length`）を使います（8章）。

### 構文記法（EBNF）

以下の構文ルールでは、`=` の左側が構文要素の名前、引用符の中がソースにそのまま書く文字、`|` が選択、`[ ]` が省略可能、`{ }` が 0 回以上の繰り返しを表します。

```
Program            = { TopLevelStatement } .
TopLevelStatement  = FunctionDefinition | UseStatement | Statement .
Statement          = Pipeline [ "when" Expression ] "." | BlockTerminatedPipeline .
BlockTailStatement = Pipeline [ "when" Expression ] [ "." ] | BlockTerminatedPipeline .
Block              = { Statement } [ BlockTailStatement ] .

Pipeline           = Expression { ( ">>" | ">?>" ) PipelineStage | ">!>" Expression } .
PipelineStage      = ProcessCall | Binding | StreamBlock .
ProcessCall        = ProcessName [ "(" ArgumentList ")" ] .
ArgumentList       = Pipeline { "," Pipeline } [ "," ] .
Binding            = VariableName | "(" VariableName "," VariableName
                     { "," VariableName } ")" .

BlockTerminatedPipeline = Expression { ">>" PipelineStage } ">>" StreamBlock .

StreamBlock        = SimpleStreamBlock
                   | ReduceBlock
                   | ForkBlock
                   | UpdateBlock
                   | CheckBlock
                   | TryBlock .

AliasClause        = "as" ( VariableName
                     | "(" VariableName "," VariableName { "," VariableName } ")" ) .

Body               = ":" Block .   (* 字下げで終わる。「`:` と字下げで書くブロック」を参照 *)

SimpleStreamBlock  = SimpleStreamName [ AliasClause ] ( Body | "(" Pipeline ")" )
                   | SimpleStreamName ProcessCall
                   | BareStreamName
                   | "Loop" [ AliasClause ] Body .
SimpleStreamName   = "Map" | "Filter" | "Count" | "Sort" | "SortDesc" | "Group" | "Any" | "All" .
BareStreamName     = "Sort" | "SortDesc" | "Any" | "All" .   (* 本体を省くと、本体が "@" と同じ *)

ReduceBlock        = "Reduce" [ "(" Expression ")" ] ( [ AliasClause ] Body | ProcessCall ) .

ForkBlock          = "Fork" [ AliasClause ] ":" ( ForkListBody | ForkDictBody )
                   | "Fork" [ AliasClause ] "(" ArgumentList ")" .
ForkListBody       = { Statement } BlockTailStatement .
ForkDictBody       = { ForkEntry } ForkTailEntry .
ForkEntry          = VariableName ":" Statement .
ForkTailEntry      = VariableName ":" BlockTailStatement .

UpdateBlock        = "Update" [ AliasClause ] ":" UpdateBody .
UpdateBody         = { UpdateStatement } [ UpdateTailStatement ] .
UpdateStatement    = Expression { ">>" PipelineStage } ">>" FieldTarget "." .
UpdateTailStatement = Expression { ">>" PipelineStage } ">>" FieldTarget [ "." ] .
FieldTarget        = ( VariableName | "@" ) "::" Identifier { "::" Identifier } .

CheckBlock         = "Check" [ AliasClause ] ":" CheckBranches .
CheckBranches      = WhenBranch { WhenBranch } ElseBranch .
WhenBranch         = "when" Expression Body .
ElseBranch         = "else" Body .

TryBlock           = "Try" [ AliasClause ] Body
                     "Catch" [ AliasClause ] Body .

FunctionDefinition = [ ParameterList ">>" ] "pop" ProcessName Body .
UseStatement       = StringLiteral ">>" "Use" [ "(" ProcessName { "," ProcessName } [ "," ] ")" ] "." .
ParameterList      = "(" VariableName { "," ( VariableName | ProcessName ) } ")" .
                     (* 2 番目以降の大文字の名前は処理引数。13章「処理引数」を参照 *)

Expression         = OrExpr .
OrExpr             = AndExpr { "or" AndExpr } .
AndExpr            = NotExpr { "and" NotExpr } .
NotExpr            = "not" NotExpr | CompareExpr .   (* 式の途中の not は UnaryExpr *)
CompareExpr        = AddExpr [ ( "==" | "!=" | ">" | "<" | ">=" | "<=" | "in" | "not" "in" ) AddExpr ] .
AddExpr            = MulExpr { ( "+" | "-" ) MulExpr } .
MulExpr            = UnaryExpr { ( "*" | "/" | "%" ) UnaryExpr } .
UnaryExpr          = ( "-" | "not" ) UnaryExpr | PostfixExpr .
PostfixExpr        = PrimaryExpr { "[" Expression "]" | "::" Identifier } .
PrimaryExpr        = Literal | VariableName | "@" | InlineProcessCall
                   | "(" Pipeline ")" | ValueList | ListLiteral | DictLiteral .
InlineProcessCall  = ProcessName [ "(" ArgumentList ")" ] .   (* "@ >> " を省いた書き方 *)
```

* `SimpleStreamName ProcessCall`（`Map FizzBuzz`）は `SimpleStreamName "{" "@" ">>" ProcessCall "}"` と、`SimpleStreamName "(" Pipeline ")"`（`Map (@ >> FizzBuzz)`）は `SimpleStreamName "{" Pipeline "}"` と同じ意味です。`ProcessCall` には、`{ }` が必要な処理と `Return`・`Break` は書けません。
* `FunctionDefinition` と `UseStatement` は `TopLevelStatement` にだけ入っているため、ブロックや関数の中には書けません。`UseStatement` の `StringLiteral` は、`{…}` の補間を含まない文字列です（13章「ほかのファイルの関数を使う（`Use`）」）。
* ブロックで終わる文の末尾（`Map: ...` や `pop 関数名: ...` など）と、ブロック内の最後に書かれた文（1文だけの場合を含む）では、文末の `.` を省略できます。
* `BlockTerminatedPipeline` の `}` のすぐあとに `>>` が続くときは、外側のパイプラインがそのまま続き、最後が `StreamBlock` でなければ `.` で閉じます。
* `InlineProcessCall` は、`@ >> ProcessName`（補助引数があれば `@ >> ProcessName(…)`）と同じ意味です。`Map`、`Filter`、`Count`、`Any`、`All`、`Reduce`、`Sort`、`SortDesc`、`Group`、`Fork`、`Update`、`Check`、`Loop`、`Try`、`Catch` のようにブロックが必要な処理は、この形では書けません。
* `>!>` の右は、いつも `Expression` です。名前を書いても束縛にはならず、その名前の値を読みます。`UpdateStatement` の `>>`、`UseStatement` の `>>`、`FunctionDefinition` の `>>` には、`>?>` や `>!>` は書けません。
* `PrimaryExpr` に `"(" Pipeline ")"` があるため、式の途中でも丸括弧で囲んでパイプラインを使えます（例: `([1, 2] >> Length) + 1`）。

### パイプラインの評価

パイプラインでは、まず最初の式を評価して現在値にします。続く各段階では現在値を入力として 1 回ずつ処理し、その結果で現在値を置き換えていきます。最後の現在値が、パイプライン全体の結果になります。

```
-5 >> Abs >> result.
```

上の文では `-5` → `Abs` → `result` の順に評価します。`result` には `5` が入り、文全体の結果も `5` です。

### 途中を覗く（`>?>`）

`>?>` は `>>` と同じく、左の値を右の段階へ渡します。そのとき、渡す値を、行番号と直前の段階の名前を付けて表示します。値は変えません。`>> Debug >>` と同じ働きに、場所の表示を足したものです。確認が終わったら、`?` を消して `>>` に戻します。

```
(1, 6) >> Range >?> Filter (@ % 2 == 0) >?> Map (@ * 10) >> tens.
```

```
[>?> line 1 after Range] (List) [1, 2, 3, 4, 5, 6]
[>?> line 1 after Filter] (List) [2, 4, 6]
```

* 表示の形は `[>?> line 行番号 after 段階の名前] (型名) 値` です。直前の段階に名前がない（リテラルや式の）ときは、`after …` を省きます。値の書き方は `Debug` と同じです。
* `>?>` のあとにも、`>>` と同じく段階が必要です。名前を書けば束縛になります（`"7" >> Num >?> d.`）。
* `popcorn test` は、`>?>` が残っているファイルに、行番号付きで注意を出します（17章）。テストの成否は変えません。

### 失敗したら差し替える（`>!>`）

`>!>` は、それより左の段階のどこかでエラーが起きたとき、パイプラインを止めずに、右の式の値に差し替えて続けます。エラーが起きなければ、右の式は計算せず、左の値をそのまま次へ渡します。

```
"https://api.example.com/user" >> Fetch >> FromJson >!> {"name": "guest"} >> user.
"実数: " >> Input >> Trim >> Num >!> 200 >> c.
```

* 守る範囲は、同じパイプラインの、`>!>` より左ぜんぶです（最初の式も含みます）。右側より先で起きたエラーは守りません。`>!>` を 2 つ書くと、2 つ目は、1 つ目の差し替えも含めた左ぜんぶを守ります。
* 右の式の中の `@` は、`Catch` と同じ `{"type": Str, "message": Str}` の `Dict` です（`>!> "失敗: {@::message}"`）。
* 捕まえるエラーは `Try` / `Catch` と同じです（`SyntaxError` 以外の実行時エラー）。`Return` と `Break` はエラーではないので、そのまま通ります。
* 右に名前を書いても束縛にはなりません。値を読むだけです（`>!> fallback >> x.` は、変数 `fallback` の値に差し替えて `x` に束縛します）。
* 書き間違いによる `TypeError` なども、黙って差し替えます。エラーの種類で分けたいとき、記録を残したいとき、回復に何文も必要なときは、`Try` / `Catch`（12章）を使います。

## 5. 現在値、別名、アクセス、スコープ

`@` は現在のパイプ値を表します。プログラムのいちばん最初では `@` は `null` です。

### 文をまたいだときの `@` の動き

ブロックや関数本体の中では、`@` はそのブロックや関数が受け取った**入力値**を覚えています。

* 1つのパイプラインの途中では、段階ごとの結果が次の段階の入力として渡されます。
* 新しい文（パイプライン）の先頭では、`@` はもう一度そのブロックや関数の入力値を指します。

### 別名（`as`）

ストリームブロックでは、`as` を使って現在値にわかりやすい別名を付けられます。

```
[1, 2, 3] >> Map as value:
    value * 2.
>> doubled.
```

`Reduce` や `Loop` のように値リストや `List` が流れてくるブロックでは、`as (a, b)` で分解して名前を付けられます。別名はブロックの中だけで有効なので、外側に同じ名前があっても上書きしません。

### アクセス

リストの要素は `value[index]`、辞書のフィールドは `value::field` で取り出せます。文字列も `text[index]` で、その位置の 1 文字（Unicode コードポイント単位の `Str`）を取り出せます（`"abc"[0]` は `"a"`、`"abc"[-1]` は `"c"`）。

```
[10, 20] >> values.
{"name": "Ada"} >> user.
values[0] >> first.
user::name >> name.
```

存在する添字やキーを指定すると、その値が返ります。負の添字はうしろから数えます（`values[-1]` は最後の要素）。`Get` と `Set` の添字も同じです。`List`・`Str` の範囲外の添字は `IndexError`、添字の型違いは `TypeError`、存在しない `Dict` キーは `KeyError` になります。

### スコープと束縛

プログラムのいちばん外側はグローバル（大域）スコープです。関数呼び出し、ストリームブロックの各評価、`Check` の各分岐、`Loop` の各反復、`Try`/`Catch` の各ブロックは、それぞれローカルスコープを作ります。名前を探すときは、現在のスコープから外側へ向かって探します。

パイプラインの最後で束縛すると、現在のスコープに名前が作られます。同じスコープに同じ名前がすでにあれば、新しい値に結び直します。内側のスコープで束縛しても、外側の同じ名前には影響しません。

## 6. 式、`Bool`、演算子

二項演算子は次のとおりです。

```
+  -  *  /  %
==  !=  >  <  >=  <=  in  not in
and  or
```

単項演算子は `-` と `not` です。

| 優先順位 | 演算子 | 結合方向 | 入力と結果 |
|---|---|---|---|
| 1 | `(式)` / `(パイプライン)` | — | 内側を先に評価します |
| 2 | `-`（単項） | 右 | 数値の符号反転 |
| 3 | `*`、`/`、`%` | 左 | 数値の乗算、除算、剰余 |
| 4 | `+`、`-` | 左 | 数値演算、同じ型のコレクションの連結、数値の減算 |
| 5 | `==`、`!=`、`>`、`<`、`>=`、`<=`、`in`、`not in` | 非結合 | 比較・含有判定の `Bool` |
| 6 | `not` | 右 | `Bool` の否定 |
| 7 | `and` | 左 | `Bool` の論理積（短絡評価） |
| 8 | `or` | 左 | `Bool` の論理和（短絡評価） |

`not` は比較より弱く結びつきます。`not @ in ["a", "i"]` は `not (@ in ["a", "i"])`、`not a == b` は `not (a == b)` の意味です。比較の右側など、式の途中に書いた `not`（`x == not y`）は、すぐあとの値だけを否定します。

### 数値演算の型ルール

* 数値演算（`+`、`-`、`*`、`/`、`%`）はすべて `Num` を入力とし、`Num` を返します。
* 整数どうしの割り算（小数点以下切り捨て）をしたいときは標準関数 `Div` を使います（例: `7 >> Div(2)` は `3`）。
* `0` での割り算（`/`、`Div`）と剰余（`%`）は `RuntimeError` です。
* `+` は数値の足し算だけでなく、`Str` どうしや `List` どうしの連結にも使えます。連結結果は新しい値として作られます。

### 剰余（`%`）の符号

`a % b` の結果の符号は、割られる数 `a` と同じです（C や JavaScript と同じ方式です）。`Div` が `0` の方向へ切り捨てるので、`a` が整数のとき、`(a, b) >> Div` に `b` を掛けて `a % b` を足すと、いつでも `a` に戻ります。

| 式 | 結果 |
|---|---|
| `7 % 3` | `1` |
| `-7 % 3` | `-1` |
| `7 % -3` | `1` |
| `-7 % -3` | `-1` |

負の数では結果が負になります（Python とは違います）。次の書き方をおすすめします。

* 奇数かどうかは、`n % 2 == 1` ではなく `n % 2 != 0` で調べます（`-3 % 2` は `-1` です）。
* `0` 以上に収めたいとき（ぐるぐる回る添字など）は、`((i % n) + n) % n` と書きます。

### 比較と `in` 演算子

大小比較（`>`、`<`、`>=`、`<=`）は数値どうし、または `Str` どうし（Unicode コードポイント順）で使えます。比べられない型の組み合わせは `TypeError` です。

`item in target` は `target >> Contains(item)` と同じ意味です。`List` の要素、`Dict` の `Str` キー、`Str` の部分文字列が含まれるかを調べて `Bool` を返します。

`item not in target` は、その逆です（含まれていなければ `true`）。

```
["kati", "su", "nana"] >> Map Slice(-1, Length) >> lasts.
lasts >> Count (@ not in ["a", "i"]) >> others.     // 1
```

### 厳格な `Bool` ルール

`Filter` の結果、`Check` の `when` 条件、`and`、`or`、`not` が受け付けるのは `Bool` だけです。数値・文字列・リスト・辞書・`null` を暗黙に `true`/`false` として扱うことはできません。`Bool` 以外を渡すと `TypeError` になります。

```
5 >> value.
value > 0 and value < 10 >> valid.
value in [1, 3, 5] >> matched.
```

## 7. 文字列（3種類）と補間

`Str` リテラルには、3種類の書き方があります。用途で使い分けます。

| 種類 | 書き方 | `{式}` の補間 | `\` のエスケープ | 主な使い道 |
|---|---|---|---|---|
| 補間文字列 | `"…"` | あり | あり | ふつうの文字列。変数や式を埋め込むとき。文字としての `{` `}` を `{{` `}}` と書けるのは、この種類だけです |
| プレーン文字列 | `'…'` | なし | あり | JSON やテンプレートなど、`{` `}` をそのまま書きたいとき |
| 生（raw）文字列 | `` `…` `` | なし | なし | ファイルパスや正規表現など、`\` も `{ }` も、一切加工したくないとき |

### 補間文字列（`"…"`）

`\` はエスケープの合図です。

| 表記 | 文字 |
|---|---|
| `\n` | 改行 |
| `\t` | タブ |
| `\\` | バックスラッシュ |
| `\"` | 二重引用符 |
| `\'` | 単引用符 |

文字列の中に `{式}`（または丸括弧を含む `{パイプライン}`）を書くと、その場で評価した結果を第3節の `Str` 変換ルールで文字列にして埋め込みます。補間式では、その文字列がある場所の現在値と字句スコープがそのまま使えます。

文字としての `{` は `{{`、`}` は `}}` と書きます。`{0}`、`{12}` のように、数字だけを囲んだ `{ }` は補間せず、そのまま文字になります（数を補間しても意味がないためです。`Format` の位置プレースホルダとして、`"{0} 対 {1}" >> Format(3, 1)` のように書けます）。補間式の中に辞書リテラル `{...}` のような波括弧が出てきても、字句解析器が波括弧の入れ子と中の文字列リテラルを追跡して、正しい閉じ `}` を見つけます。

```
"Ada" >> person.
"Hello, {person}!" >> greeting.
"{{user}} = {person}\n" >> line.
```

補間式の中で構文エラーや未定義名、評価エラーが起きた場合は、PopCorn エラーになります。

### プレーン文字列（`'…'`）

`'…'` では、`{` と `}` は、ただの文字です。補間はされません。`\n`、`\t`、`\\`、`\'` などのエスケープは、補間文字列と同じように使えます。`{{` も、2つの波括弧のままです。

```
'{"name": "Ada"}' >> json.      // {"name": "Ada"}
'Hello {name}' >> text.         // Hello {name}（補間されません）
'it\'s' >> word.                // it's
```

`'…{name}…'` のように、`{識別子}` の形が入っていると、「補間されません。値を入れたいときは `"…"` を使います」という注意（警告）を、診断に出します。プログラムは、そのまま実行できます。`{{name}}` のように波括弧を二重にしたものは、テンプレートとして、わざと書くことがあるので、注意の対象にしません。

### 生文字列（`` `…` ``）

`` `…` `` の中は、書いたとおりの文字になります。`\` はエスケープになりません。`{ }` は補間されません。

```
`C:\Users\ada\new` >> path.     // C:\Users\ada\new
`\d+\.\d{2}` >> pattern.        // \d+\.\d{2}
```

* 同じ行の中で閉じます。行をまたぐと、「文字列が閉じられていません」というエラーです。
* 正規表現は、`\` をそのまま書ける生文字列で書くのがおすすめです（``"tel: 090-1234-5678" >> Match(`\d{3}-\d{4}`)``）。使える書き方は、文字クラス（`[a-z]`、`\d`、`\w`、`\s`）、量指定子（`*`、`+`、`?`、`{n,m}`）、グループ `( )`、選択 `|`、位置 `^` `$` などの基本的なものです。処理系による違いが出やすい書き方（後読み、名前つきグループなど）は、使わないことをおすすめします。
* バッククォートそのものは、中に入れられません。入れたいときは、`"`" や `'`'` のように、ほかの種類の文字列で書きます。

## 8. 標準ストリーム処理

ストリーム処理は、処理名、任意の引数や `as` 別名、`:`、字下げした本体の順に書きます。別名を省いたときは本体の中で `@` を使います。本体は上から順に評価され、最後の文の結果がブロック全体の結果になります。短い処理なら、式渡しや処理名渡しで 1 行に書けます。

```
[1, 2, 3] >> Map as x:
    x * 2.
>> doubled.
```

### 本体を短く書く（式渡しと処理名渡し）

`Map` などの本体は、2 つの短い形でも書けます。

ストリーム名のあとの丸括弧は、ふつうの処理の `Func(…)` と同じく、いつも**補助引数**です。補助引数をどう使うかは、処理ごとに決まっています。

| 処理 | 丸括弧の補助引数 | いつ計算されるか |
| :--- | :--- | :--- |
| `Map`、`Filter`、`Count`、`Any`、`All`、`Sort`、`SortDesc`、`Group` | 各要素に当てる式（条件・変換・キー） | 要素ごとに、`@` をその要素にして毎回 |
| `Reduce` | 初期値 | 最初に 1 回だけ（`@` は流れてきた `List`） |
| ふつうの処理（`Split(",")` など） | 2 番目以降の引数 | 呼ぶ前に 1 回だけ |
| ユーザー関数 | 引数名が小文字なら値、大文字なら処理引数 | 値は呼ぶ前に 1 回だけ、処理引数は関数の中で呼ぶたびに（13章「処理引数」） |

| 呼び名 | 英語名 | 書き方 | 同じ意味のブロック |
| :--- | :--- | :--- | :--- |
| **式渡し** | expression body | `Map (@ * 2)` | `Map:` の本体が `@ * 2` |
| **処理名渡し** | process-name body | `Map FizzBuzz` | `Map:` の本体が `@ >> FizzBuzz` |

#### 式渡し（`Map (式)`）

`Map`、`Filter`、`Count`、`Any`、`All`、`Sort`、`SortDesc`、`Group` は、本体が 1 つの式だけなら、`:` のブロックの代わりに、その式を補助引数として丸括弧で渡せます。式の中の `@`（または `as` の別名）が、各要素です。

```
[1, 2, 3, 4] >> Filter (@ % 2 == 0) >> evens.     // 本体が @ % 2 == 0 の Filter: と同じ
[1, 2] >> Map as x (x * 10) >> tens.               // 本体が x * 10 の Map as x: と同じ
```

#### 処理名渡し（`Map 処理名`）

本体が「各要素に、処理を 1 つ当てるだけ」なら、処理名だけを書けます。補助引数もつけられます。`Reduce` も、この形が使えます（`(acc, item)` が、そのまま処理に渡ります）。

```
(1, 20) >> Range >> Map FizzBuzz >> Display.       // 本体が @ >> FizzBuzz の Map: と同じ
[1, 2, 3, 4] >> Filter IsEven >> evens.
[[1, 2], [3]] >> Map Length >> sizes.              // [2, 1]
users >> Map Get("name") >> names.
words >> Sort Lowercase >> sorted.
[1, 2, 3] >> Reduce Add >> total.                  // 6
[1, 2, 3] >> Reduce(10) Add >> total2.             // 16
```

* 処理名渡しは、「処理名だけで書く（`@` に適用）」（4章）を、`Map:` の本体に当てはめたものです。新しい規則ではありません。
* 処理名渡しで書けるのは、ふつうの処理（標準関数と `pop` で定義した関数）だけです。`Check`、`Map`、`Loop`、`Return`、`Break` などは書けません（`Map:` のように、ブロックで書きます）。
* `as` をつけたときは、処理名渡しは使えません。式渡しか `:` のブロックで書きます。
* `Reduce` の補助引数は初期値なので、`Reduce` は式渡しを持ちません（`Reduce(10) Add` のように、初期値と処理名渡しは組み合わせられます）。
* `Loop`、`Fork`、`Update`、`Check`、`Try` は、式渡しも処理名渡しも持ちません（`Fork` には、丸括弧に分岐を並べる 1 行の形があります。`Fork` の節を見てください）。

### `Map`

`Map` は `List` の各要素を順番に変換し、同じ長さの新しい `List` を返します。

```
[1, 2, 3] >> Map as value:
    value * 2.
>> doubled.
```

### `Filter`

`Filter` は、ブロックが `Bool` の `true` を返した要素だけを残します。

```
[1, 2, 3, 4] >> Filter as value:
    value % 2 == 0.
>> evens.
```

### `Count`

`Count` は、ブロックが `Bool` の `true` を返した要素の**数**を、`Num` で返します。`Filter` のあとに `Length` をつなげたのと同じ意味です。本体が `Bool` 以外を返すと `TypeError`、空 `List` なら `0` です。

```
["kati", "tuka", "mimi", "su"] >> words.
words >> Map Slice(-1, Length) >> lasts.       // 最後の 1 文字: ["i", "a", "i", "u"]
lasts >> Count (@ == "i") >> verbs.            // 2
words >> Count as w:
    (w >> Length) > 2
>> long_words.                                 // 3
```

### `Any` と `All`

`Any` は、ブロックが `true` を返す要素が 1 つでもあれば `true` を、`All` は、すべての要素で `true` なら `true` を返します。答えが決まったところで止めるので、残りの要素では、ブロックを計算しません。空 `List` では、`Any` は `false`、`All` は `true` です。ブロックが `Bool` 以外を返すと `TypeError` です。

```
[72, 85, 90] >> All (@ >= 60) >> passed.          // true
["a", "", "c"] >> Any (@ == "") >> has_empty.     // true
[true, false] >> Any >> some.                      // ブロックを省くと、要素そのものを調べる
```

### `Reduce`

`Reduce` は `List` を 1 つの値にまとめます。初期値を `Reduce(initial)` で渡せます。各反復では `(accumulator, item)` の値リストが流れてくるので、`as (acc, item)` でそのまま受け取れます。

* 初期値を指定したとき、空 `List` ならブロックを実行せず初期値をそのまま返します。
* 初期値を省いたときは先頭要素が初期 `accumulator` になり、空 `List` は `RuntimeError` です。

```
[1, 2, 3, 4] >> Reduce(0) as (acc, item):
    acc + item.
>> total.

// 初期値を省略する書き方
[1, 2, 3, 4] >> Reduce as (acc, item):
    acc + item.
>> total2.
```

### `Sort` と `SortDesc`

`Sort` はブロックが返すキーで昇順に、`SortDesc` は降順に安定ソートした新しい `List` を返します。

* キーは、数値どうし、`Str` どうし、またはそれらを並べた `List` どうしです。比べられない組み合わせ（数値と `Str` など）は、`<` と同じく `TypeError` です。
* キーが `List` のときは、先頭の要素から順に比べ、同じなら次の要素で比べます（辞書式）。「点数の高い順、同じ点なら名前順」のように、いくつもの基準で並べられます。
* キーを省くと、要素そのものをキーにします（`[3, 1, 2] >> Sort` は `[1, 2, 3]`）。

```
[
    {"name": "Ada", "score": 20},
    {"name": "Bob", "score": 10}
] >> users.

users >> SortDesc as user:
    user::score.
>> by_score.

users >> SortDesc as user:
    user::name.
>> by_name_desc.

[3, 1, 2] >> Sort >> ascending.                  // [1, 2, 3]
users >> Sort ([0 - @::score, @::name]) >> ranking.  // 点数の高い順、同じなら名前順
```

### `Group`

`Group` はブロックが返す `Str` をキーにして、値を `Dict` に分類します。各グループ内の並び順と、キーが最初に現れた順番をどちらも保ちます。

```
[
    {"team": "red", "name": "A"},
    {"team": "blue", "name": "B"},
    {"team": "red", "name": "C"}
] >> Group as member:
    member::team.
>> by_team.
```

### `Fork`

`Fork` は同じ入力に対して複数の分岐を実行します。「ラベルなし形式」と「ラベル付き形式」があり、1つの `Fork` の中で混ぜることはできません。どれか 1 つでも分岐が失敗すると、`Fork` 全体がエラーになります。

* **ラベルなし形式:** 書いた順に結果を並べた `List` を返します。
* **ラベル付き形式:** `label: Statement` の組を、書いた順の `Dict` として返します。

```
// ラベル付き形式（Dict を返します）
[1, 2, 3] >> Fork as values:
    total: values >> Sum.
    max:   values >> Max.
>> stats.
stats::total >> Display.
```

分岐が短い式だけなら、丸括弧の中に、`,` で区切って 1 行で書けます。ふつうの処理の補助引数と同じく丸括弧の中なので、それぞれにパイプラインも書けます。各分岐は、`@`（または `as` の別名）を入力値にして、書いた順に計算し、ラベルなし形式と同じ `List` を返します。

```
[3, 8, 4] >> Fork(Sum, Average, Max - Min) >> (total, avg, spread).
"a,b" >> Fork as s (s >> Split(","), s >> Length) >> parts.   // [["a", "b"], 3]
```

* 1 行の形にはラベルを付けられません。ラベル付き形式は `Fork:` のブロックで書きます。

### `Update`

`Update` は `Dict` を非破壊的に更新します。`UpdateBlock` の中では、`>>` で好きな段数のパイプラインをつないで、最後を `>> target::field.` にします。トップレベルのフィールドを追加・上書きします。書いた順に反映されるため、後ろの行から直前に更新したフィールドを参照できます。

```
{"name": "Ada", "score": 10} >> Update as user:
    15 >> user::score.
    true >> user::active.
>> updated.
```

左辺はパイプラインでもかまいません。自分のフィールドを加工して、そのフィールドへ書き戻せます。

```
{"name": "ada", "score": 1} >> Update as user:
    user::name >> Uppercase >> user::name.
    user::score >> Add(10) >> user::score.
>> updated.
// updated は {"name": "ADA", "score": 11}
```

`>> @::a::b` のように `::` を続けると、入れ子の `Dict` のフィールドを書き換えられます。途中のフィールドがなければ、新しい `Dict` を作ります。途中のフィールドが `Dict` 以外のときは `TypeError` です。

```
{"name": "Ada", "address": {"city": "Tokyo"}} >> Update:
    "Osaka" >> @::address::city.
>> moved.
// moved は {"name": "Ada", "address": {"city": "Osaka"}}
```

更新後は新しい外側の `Dict` が作られ、触っていない入れ子の値はそのまま残ります。キーを削除したいときは `Remove` を使ってください。

## 9. `Zip`

`Zip` は空でない `List` 群を値リストまたはパイプ追加引数で受け取り、同じ位置の要素を `List` にまとめた `List` を返します。いちばん短い入力に達したところで止まります。

```
([1, 2], [10, 20]) >> Zip >> rows.
// [1, 2] >> Zip([10, 20]) >> rows. とも書けます
// rows は [[1, 10], [2, 20]]
```

## 10. `Check`

`Check` は条件によって 1 つのブロックを選ぶ標準ストリーム処理です。上から順に `when` 条件を評価し、最初に `true` になった分岐だけを実行します。`else` は必ず書きます。

すべての `when` 条件は `Bool` を返す必要があります。`Bool` 以外を返すと `TypeError` です。複数の候補に当てはまるか調べたいときは `in` 演算子が便利です。

```
2 >> Check as value:
    when value == 0:
        "zero".
    when value in [1, 2, 3]:
        "small".
    when value >= 4:
        "large".
    else:
        value >> Str.
>> label.
```

分岐の本体が短いときは、`:` と同じ行に書けます（4章「`:` と字下げで書くブロック」）。

```
x >> Check:
    when @ < 0: "negative"
    when @ == 0: "zero"
    else: "positive"
>> sign.
```

```
(num) >> pop FizzBuzz:
    num >> Check:
        when num % 15 == 0: "FizzBuzz"
        when num % 3 == 0: "Fizz"
        when num % 5 == 0: "Buzz"
        else: num
```

`:` のあとの本体は、その行の終わりまでです（次の行の字下げが見出しより深ければ、そこまで続きます）。`when a: 1 else: 2` のように、次の分岐を同じ行に書くことはできません。分岐ごとに行を分けます。

## 11. `Loop` と `Break`

`Loop` は状態値をくり返し更新する標準ストリーム処理です。ブロックの最後の値が、次の反復の状態になります。状態値が 1 つなら `Loop as state:`、値リストで複数持つなら `Loop as (a, b):` と書けます。

各反復は次の順で進みます。

1. 現在の状態値を `@` と別名にセットします。
2. ブロックを評価します。
3. ブロックの結果を次の状態値にします。
4. `Break` が評価されるまで 1 に戻ります。

`Break` はいちばん内側の `Loop` を終わらせ、現在のパイプ値を `Loop` の結果にします。`Loop` の外で `Break` を使うと `RuntimeError` です。

```
(0, 0) >> Loop as (count, total):
    total >> Break when count >= 5.
    (count + 1, total + count).
>> result.
```

意図的な無限ループも許されます。`Loop` を入れ子にしたとき、`Break` が止めるのは常にいちばん内側の `Loop` だけです。

## 12. `Try` と `Catch`

`Try` / `Catch` は、パイプラインの途中で起きた PopCorn エラー（`SyntaxError` を除く実行時エラー全般）をキャッチして、代わりの値で回復するための標準ストリーム処理です。

* `Try` ブロックがエラーなく終われば、その結果がそのまま次のパイプ段階へ渡ります。
* `Try` ブロックの中でエラーが起きると、`Catch` ブロックへ移ります。`Catch` ブロックの現在値（および `as` 別名）には、`{"type": Str, "message": Str}` の `Dict` が渡されます。
* `Catch` ブロックの中で別のエラーが起きた場合は、外側の `Try` またはトップレベルへ伝わります。
* 失敗したときに決まった値へ差し替えるだけなら、`>!>` で 1 行に書けます（4章「失敗したら差し替える（`>!>`）」）。

```
"https://api.example.com/user"
    >> Try:
        @ >> Fetch >> FromJson.
    Catch as err:
        err::message >> Debug.
        {"name": "guest"}.
    >> user.
```

### やり直す（`Try` と `Loop` の組み合わせ）

通信のように、一時的に失敗することのある処理は、`Loop` と `Try` / `Catch` を組み合わせて、やり直せます。

```
(0, null) >> Loop as (attempt, last):
    last >> Break when last != null.           // 成功したら、その値で終わる
    null >> Break when attempt >= 3.           // 3 回失敗したら、あきらめる（null を返す）
    "https://example.com/api" >> Try:
        Fetch.
    Catch:
        null.
    >> response.
    (attempt + 1, response).
>> result.
```

* `Loop` の状態は `(attempt, last)`（何回目か、直前の結果）です。
* 回数の上限を、必ず書きます。上限がないと、失敗し続けたとき、終わりません。
* `PostFetch` や `WriteFile` のように、書き込みを伴う処理を、やり直すと、同じ書き込みが 2 回起きるかもしれません。やり直してよいのは、同じ処理を何回しても結果が変わらない処理（読み出しなど）だけにしましょう。

## 13. 関数と `Return`

関数はプログラムのいちばん外側（`TopLevelStatement`）で `pop` を使って定義します。関数本体の最後の値が自動的に返ります。トップレベルの関数どうしは、ファイル内の書く順番に関係なく呼び合ったり、再帰呼び出ししたりできます。

関数の呼び出しを重ねられる段数には上限があり、超えると（止まらない再帰など）、`RuntimeError` です。`Try` / `Catch` で受け取れます。標準の処理系では、Python 3.12 以降（Playground を含む）で 10000 段、Python 3.10・3.11 で 300 段です。

```
(left, right) >> pop AddTwo:
    left + right.

(10, 20) >> AddTwo >> total.
10 >> AddTwo(20) >> total2.
```

### クロージャと引数

* 関数は**定義された時点の外側環境を値で捕捉する**字句スコープを使います（あとから外側の同名変数を束縛し直しても、関数の中から見える値は変わりません）。
* 関数の引数やブロックの別名はローカルなので、外側にある同じ名前の値を書き換えません。
* 複数引数の関数には、値リスト `(a, b) >> Func` またはパイプ追加引数 `a >> Func(b)` で順番どおりに値を渡します。引数の数が合わないと `RuntimeError` です。

### 処理引数（大文字の引数）

関数の引数のうち、2 番目以降を大文字で始めると、**処理引数**になります。処理引数には、呼ぶ側が丸括弧に書いた式が、計算されないまま、ひとつの処理として渡ります。関数の中では、その名前をふつうの処理と同じように呼べます（`x >> Keep`、`Filter Keep`、`Map (Keep)`）。呼ばれるたびに、そのときの入力を `@` にして式を計算します。

これで、`Filter (@ > 0)` のように「要素ごとに計算する補助引数」を受け取る処理を、自分で作れます。

```
(xs, Keep) >> pop MyFilter:
    xs >> Filter Keep.

[1, 2, 3, 4] >> MyFilter(@ % 2 == 0) >> evens.     // [2, 4]
[1, 2, 3, 4] >> MyFilter(IsEven) >> evens2.        // 処理名を渡すこともできる

(xs, init, Step) >> pop Fold:
    xs >> Reduce(init) as (acc, x):
        (acc, x) >> Step.

[1, 2, 3] >> Fold(10, @[0] + @[1]) >> total.        // 16（init は値、Step は処理引数）
```

* 処理引数の式は、それを書いた場所の変数を見ます（`3 >> k.` のあとの `Fold(0, @[0] + @[1] * k)` では、`k` は 3）。
* 処理引数は丸括弧の補助引数でだけ渡せます。値リスト `(xs, 5) >> MyFilter` のように、計算済みの値を渡すと `TypeError` です。
* 処理引数は補助引数をとりません（`x >> Keep(1)` は `RuntimeError`）。
* 1 番目の引数（流れてくる値）は、処理引数にできません。`Map`、`Check`、`Return` などの名前も使えません。

### `Return`

`Return` は関数の途中で早めに抜けるための標準パイプ処理です。いちばん内側の `pop` 関数をその場で終わらせ、現在のパイプ値を関数の結果にします。関数の外で使うと `RuntimeError` です。

```
(value, min, max) >> pop Clamp:
    value >> Check:
        when @ < min:
            min >> Return.
        when @ > max:
            max >> Return.
        else:
            @.

150 >> Clamp(0, 100) >> clamped.
```

`Break` が抜けるのはいちばん内側の `Loop`、`Return` が抜けるのはいちばん内側のユーザー関数です。

### ほかのファイルの関数を使う（`Use`）

関数は、別のファイルに分けて書き、`ファイル名 >> Use.` で読み込んで使えます。ファイル名を左に書き、`>>` で `Use` へ流す、ふつうのパイプラインと同じ向きです。

```
// lib/text.pop
"*" >> mark.

(text) >> pop Shout:
    text >> Uppercase >> Decorate

(text) >> pop Decorate:
    "{mark} {text} {mark}"
```

```
// main.pop
"lib/text.pop" >> Use.

"popcorn" >> Shout >> Display.     // * POPCORN *
```

使う関数を選ぶときは、補助引数に処理名を並べます。並べなかった関数は、このファイルからは見えません。

```
"lib/text.pop" >> Use(Shout).
```

* **書く場所:** `Use` はファイルのいちばん外側に、1 行の文として書きます。ブロックや関数の中、`when` つき、`>>` で後ろに続ける書き方はできません（`SyntaxError`）。ファイル名は、`{…}` を含まない文字列をそのまま書きます（変数や計算でファイル名を作ることはできません）。どこに書いても意味は同じですが、ファイルの先頭にまとめるのがおすすめです。
* **ファイルの場所:** ファイル名は、`Use` を書いたファイルのあるフォルダーから見た相対パスです（`"../shared/util.pop"` のように `..` も使えます）。区切りは `/` です。REPL では、いまのフォルダーから探します。拡張子は省略できません。
* **読むタイミング:** `Use` は、そのファイルのほかの文より先に処理します。そのため、関数の定義と同じく、`Use` より上の行からでも、読んだ関数を呼べます。
* **1 回だけ評価:** 読まれたファイルは、1 回の実行で 1 回だけ、最初から最後まで評価します（同じファイルを何か所から `Use` しても、2 回は動きません）。そのファイルの `@` は `null` から始まります。そのファイルにある `Display` なども実行されるので、関数を集めたファイルには、関数と、関数が使う値だけを書くのがおすすめです。
* **読み込まれるもの:** 読み込まれるのは、そのファイルで `pop` で定義した関数だけです。値の名前（上の `mark`）や、そのファイルがさらに `Use` した関数は、読み込まれません。必要なら、そのファイルを直接 `Use` します。
* **関数の中から見えるもの:** 読んだ関数は、定義されたファイルの中で動きます。関数の中から見える値の名前とほかの関数は、そのファイルのものです（`Shout` が呼ぶ `Decorate` と `mark` は、`lib/text.pop` のもの）。読んだ側の同じ名前の値や関数には影響されません。
* **名前の重なり:** 読んだ関数と同じ名前の関数を、そのファイルでも `pop` で定義していると `NameError` です。2 つのファイルから同じ名前の関数を読んだときも `NameError` です（`Use(…)` で、どちらかを選んでください）。標準処理と同じ名前の関数は、ふつうの関数と同じく、標準処理より優先されます。
* **エラー:** ファイルが読めないときは `IOError`、`Use(…)` に書いた名前の関数がそのファイルにないときは `NameError`、ファイルどうしが輪のように `Use` しあっている（`a.pop` → `b.pop` → `a.pop`）ときは `RuntimeError` です。読んだファイルの中の構文エラーや評価のエラーには、そのファイルの名前が付きます。
* **Playground:** Playground では、エクスプローラーのファイルを、同じ決まりで読みます（`samples/` の例から `"../main.pop" >> Use.` のように、ほかのフォルダーのファイルも読めます）。

## 14. 非破壊性と外部効果

`List`・`Dict`・`Str` を加工する標準処理は、元の値を変えずに新しい値を返します。元の名前に結果をしまいたいときは、ふつうに束縛し直します。

```
[1, 2, 3] >> value.
value >> Reverse >> value.
```

`Display`、`Input`、`Debug`、`ReadFile`、`WriteFile`、`Fetch`、`PostFetch`、`HttpRequest`、`Env`、`Args`、`Now`、`Sleep`、`Random` のように、画面・入出力・ネットワーク・ファイル・時間・乱数へ働きかける処理は「外部効果処理」です。

外部効果処理も、特記がない限り結果の値を次のパイプ段階へ渡します。`Display` と `Debug` は表示したあとに元の値をそのまま返し、`WriteFile` は書き込んだあとに `content` をそのまま返します。

## 15. エラー

構文・名前・型・評価の失敗はすべて PopCorn エラーとして報告します。エラーには、分類、説明、わかる場合は行番号と列番号を含めます。

| 分類 | 起きる例 |
|---|---|
| `SyntaxError` | 閉じていない文字列、文末の `.` の抜け、対応しない括弧、ブロックの字下げの誤り、`{ }` で書いたブロック、単独の `Func(...)` 呼び出し、いちばん外側以外の `Use` |
| `NameError` | 未定義の変数や関数の参照、`Use` で読んだ関数の名前の重なり |
| `TypeError` | 標準処理・演算子・`when`/`Filter` 条件に合わない型を渡したとき、比べられない `Sort` キー |
| `IndexError` | `List`・`Str` の範囲外アクセス、不正な `Slice` 範囲、値の足りない `Format` のプレースホルダ |
| `KeyError` | `Dict` にないキーへのアクセス（デフォルト値なしの `Get` や `::`） |
| `RuntimeError` | 0 除算、`NaN`/`Infinity`、`Loop` 外の `Break`、関数外の `Return`、深すぎる再帰、壊れた JSON、正しくない正規表現、輪になった `Use` |
| `IOError` | `ReadFile` / `WriteFile` の失敗、`Use` するファイルが読めないとき |
| `NetworkError` | `Fetch` / `PostFetch` / `HttpRequest` の通信失敗や HTTP エラー |
| `UserError` | `Throw` を評価したとき |
| `AssertionError` | `Expect`・`Assert`・`ExpectError` で確かめたことが成り立たなかったとき（17章） |

エラーが起きたパイプラインでは、そのあとの段階は評価しません。`Fork` の分岐や、`Map`・`Filter`・`Reduce`・`Sort`・`SortDesc`・`Group` の中でエラーが起きた場合も、いちばん内側の `Try`/`Catch` で捕捉されない限り、そのストリーム処理全体のエラーになります。

## 16. 実装適合性

PopCorn 1 に適合する処理系は、この文書で決めたソースコードを同じ評価順序・値・スコープ・`Str` 変換表現・標準処理の結果・エラー分類で動かします。日時・乱数・入力・ファイル・ネットワークなど実行環境に左右される具体的な値まで一致させる必要はありませんが、入力の形・結果の型・エラー分類はこの仕様に合わせます。

エディタや静的解析器は、実行結果を変えない範囲で注意を表示できます。大文字・小文字だけが標準処理名と違うユーザー名に注意を出すことはできますが、正しいプログラムとして扱います。

## 17. テスト

PopCorn では、テスト（プログラムが思ったとおりに動くかを確かめるコード）を、ふつうの PopCorn で書きます。

### テストの書き方

名前が `Test` で始まる、引数のない関数が、テストです（`TestAdd`、`Test_add`、`Test1` など。`Test` の次は大文字・数字・`_` にします。`Tester` はテストではありません）。中で、標準関数 `Expect`・`Assert`・`ExpectError` を使って、結果を確かめます。

```
(a, b) >> pop AddTwo:
    a + b.

pop TestAddTwo:
    (1, 2) >> AddTwo >> Expect(3).
    10 >> AddTwo(-3) >> Expect(7).

pop TestEvenNumbers:
    [1, 2, 3, 4] >> Filter (@ % 2 == 0) >> evens.
    evens >> Expect([2, 4]).
    (evens >> Length) == 2 >> Assert("偶数は 2 個のはず").

pop TestDivideByZero:
    0 >> ExpectError(10 / @, "RuntimeError") >> err.
    err::message >> Expect("Division by zero").
```

* `actual >> Expect(expected)` は、`==` と同じルール（3章「等価性」）で比べます。等しければ `actual` をそのまま返すので、パイプラインを続けられます。3 つめに `Str` を渡すと（`Expect(3, "1 + 2 は 3")`）、失敗したときの説明になります。
* `条件 >> Assert` は、条件が `true` かどうかを確かめます。`Assert("説明")` と書くと、失敗したときに、その説明を表示します。条件は `Bool` でなければなりません（6章「厳格な `Bool` ルール」）。
* `value >> ExpectError(式)` は、丸括弧の中の式を計算しないまま受け取り、`value` を `@` にして計算します（13章「処理引数」と同じしくみ）。エラーになれば、`Catch` と同じ `{"type": Str, "message": Str}` を返します。2 つめにエラーの分類（`"TypeError"` など）を書くと、分類も確かめます。
* 確かめたことが成り立たないと、`AssertionError` になります。`AssertionError` も PopCorn エラーなので、テストの外でも使えますし、`Try` / `Catch` で受け取ることもできます。

### テストの実行（`popcorn test`）

```
popcorn test                  // いまのフォルダの中の *_test.pop を、すべて実行
popcorn test calc_test.pop    // ファイルを指定して実行（名前は自由）
popcorn test tests            // フォルダの中の *_test.pop を実行
```

テストファイルごとに、次の順で進みます。

1. ファイル全体を、ふつうのプログラムと同じように実行します（関数の定義と、いちばん外側の文）。ここでエラーになると、そのファイルのテストは実行しません。
2. テスト関数を、ファイルに書いた順に 1 つずつ呼びます。入力（`@`）は `null` です。値は非破壊なので、あるテストが、ほかのテストの結果を変えることはありません。
3. 1 つのテストが失敗しても、残りのテストは続けて実行します。

結果は、テストごとに `✓`（成功）、`✗`（`AssertionError` で失敗）、`!`（それ以外のエラー）で表示し、最後に件数をまとめます。失敗したテストには、行番号と、期待した値・実際の値、わかるときはヒント（型のちがい、小数の誤差、前後の空白、ちがう要素の位置など）を表示します。すべて成功したときだけ、終了コードは `0` です。

```
calc_test.pop
  ✓ TestAddTwo
  ✗ TestAverage（9 行目）
      期待した値と、実際の値がちがいます。
        期待した値: 0.3
        実際の値:   0.30000000000000004
        ヒント: 小数の計算では、ごく小さな誤差が出ることがあります。Round で桁をそろえてから比べましょう（例: @ >> Round(2)）。

結果: 2 件中 1 件成功、1 件失敗。直すところがあります
```

確認用の `>?>`（4章）が残っているファイルには、`⚠ 確認用の >?> が残っています（3 行目）。` のように注意を出します。注意だけで、テストの成否と終了コードは変えません。

`popcorn calc_test.pop` のように、ふつうに実行したときは、テスト関数は呼ばれません（定義されるだけです）。

ブラウザの Playground では、コマンドの代わりに、実行ボタンで、プログラムを実行したあと、テスト関数があれば、続けて同じようにテストを実行します。

## 付録 A. PopCorn 1 の非目標と推奨スタイル

### PopCorn 1 の非目標（Non-goals）

PopCorn 1 は、気軽に書けるデータ加工スクリプトを主な用途としています。そのため、次の機能はあえて対象外にしています（将来版での拡張余地として残しています）。

* 名前空間つきの読み込み（`math::Square` のような書き方）や、パッケージの配布・取得（関数を別のファイルに分けて読むことは、`Use` でできます）
* 第一級関数（無名関数リテラルや、関数を変数・`List` に入れる機能）

### 検討中の機能（PopCorn 1 には入っていません）

`Retry`・タイムアウト、`Fork` の並列化、Python との連携は、設計のメモ（リポジトリの `docs/design`）で検討しています。どれも、PopCorn 1 の約束（評価の順序、非破壊、実行環境に依存しないこと）を崩さないかどうかを確かめてから、決めます。

### 推奨スタイルガイド

* **ブロックの書き分け:** 1 つの式だけの短い処理は `[1, 2, 3] >> Map as x (x * 2)` や `words >> Map Length` のように 1 行で書き、複数の文になるときは `:` のブロックにします。ブロックのあとの段階は、見出しの行と同じ字下げで `>> 次段階.` と続けます。字下げは 4 つの空白がおすすめです。
* **対等なペア引数の書き方:** `Random` の `(minimum, maximum)` や `Zip` の複数 `List` のように、引数が対等な関数は `(1, 6) >> Random` のように値リストで渡すのがおすすめです。
* **処理名だけで書くのは、入力がはっきりしているときだけ:** 入力を使わない処理（`Pi * 2`、`Now::year`）と、ブロックや処理名渡しの中で各要素に当てる処理（`words >> Map Length`、`Slice(-1, Length)`）は、処理名だけで書いてかまいません。それ以外で入力を使う処理（`Display`、`Sum` など）は、`value >> Sum` のように、`>>` で入力を見せて書くと、書き忘れに気づけます。
* **否定の書き方:** 「含まれていない」は `x not in xs`、「等しくない」は `a != b` と書くのがおすすめです（`not x in xs` や `not (a == b)` も同じ意味ですが、読み違えやすいです）。
* **ファイルの分け方:** 何度も使う関数は `lib/` などのファイルにまとめ、使う側のファイルの先頭に `"lib/text.pop" >> Use.` と書きます。読まれるファイルには、関数と、関数が使う値だけを書きます（`Display` などを書くと、読まれたときに動きます）。
* **長いパイプラインの改行:** 3 段階以上つながるパイプラインは、`>>` の前で改行して縦に揃えると読みやすくなります。

## 付録 B. 参考にした仕様書の構成

この仕様書の構成と記法は、字句要素・構文記法・式の評価順序・スコープ・エラーを分けて定義する次の公式資料を参考にしています。PopCorn のルールはこの文書だけで完結しており、参照先の言語ルールは取り込んでいません。

* Python 言語リファレンス: 字句解析
* The Rust Reference: Statements and expressions
* The Go Programming Language Specification
* ECMAScript Language Specification
