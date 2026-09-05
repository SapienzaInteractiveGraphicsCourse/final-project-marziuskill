//RULE COPY
const MODE_SOLO = "SOLO";
const MODE_VS_BOT = "VS_BOT";

//RULE MARKUP
export function buildGameRulesMarkup({ mode = null } = {}) {
    const showSolo = mode === null || mode === MODE_SOLO;
    const showVersus = mode === null || mode === MODE_VS_BOT;
    return `
        <div class="game-rules" tabindex="0" aria-label="Game rules">
            <div class="game-rules-intro">
                These are the rules enforced by the current game build.
            </div>

            <div class="game-rules-grid">
                <section class="game-rule-block">
                    <h3>OPENING BREAK</h3>
                    <p>The cue ball starts in the kitchen.</p>
                    <ul>
                        <li>A break is legal if an object ball is pocketed, or at least four distinct object balls contact rails.</li>
                        <li>An illegal break is reracked; the incoming player receives kitchen ball-in-hand.</li>
                        <li>A legal break scratch keeps the layout, leaves the table open, and gives the incoming player kitchen ball-in-hand.</li>
                        <li>If the 8-ball is pocketed on the break, it is respotted and play continues with an open table.</li>
                    </ul>
                </section>

                <section class="game-rule-block">
                    <h3>GROUPS & TURNS</h3>
                    <p>The groups are solids 1–7 and stripes 9–15.</p>
                    <ul>
                        <li>After the break, the table remains open until the first legally pocketed solid or stripe assigns the groups.</li>
                        <li>The rules enforce legal first contact and require a rail contact or pocket after contact.</li>
                        <li>Pocketed balls remain pocketed even when the shot is a foul.</li>
                    </ul>
                </section>

                <section class="game-rule-block">
                    <h3>FOULS & BALL IN HAND</h3>
                    <ul>
                        <li>Break fouls give ball-in-hand in the kitchen.</li>
                        <li>Normal fouls give ball-in-hand anywhere on valid cloth.</li>
                        <li>Ball-in-hand placement must remain clear of cushions, pockets and balls already in play.</li>
                    </ul>
                </section>

                <section class="game-rule-block">
                    <h3>THE 8-BALL</h3>
                    <ul>
                        <li>The pocket is called only for the 8-ball, on that player's current 8-ball shot.</li>
                        <li>You win by legally pocketing the 8-ball into the called pocket while on the 8, without fouling.</li>
                        <li>You lose for an early 8, sending the 8 off the table, scratching or fouling while pocketing it, or pocketing it in the wrong called pocket.</li>
                    </ul>
                </section>
            </div>

            ${showSolo ? `
                <section class="game-rule-block game-rule-wide game-rule-solo">
                    <h3>SOLO RUNOUT</h3>
                    <p>KILL does not take shots; he judges whether you clear the table within the move budget.</p>
                    <div class="game-rule-budget">
                        <span><strong>EASY</strong> 42 moves</span>
                        <span><strong>MEDIUM</strong> 32 moves</span>
                        <span><strong>HARD</strong> 24 moves</span>
                    </div>
                    <ul>
                        <li>Every shot costs 1 move.</li>
                        <li>Every foul adds 2 additional moves.</li>
                        <li>Every pocketed ball from the wrong assigned group adds 1 additional move.</li>
                        <li>Reaching the move limit before a legal 8-ball win is a defeat.</li>
                    </ul>
                </section>
            ` : ""}

            ${showVersus ? `
                <section class="game-rule-block game-rule-wide game-rule-versus">
                    <h3>VS KILL</h3>
                    <p>Standard two-player turn flow uses the rules above. Difficulty changes KILL's planning and execution accuracy; it does not change the rules of the rack.</p>
                </section>
            ` : ""}
        </div>
    `;
}
