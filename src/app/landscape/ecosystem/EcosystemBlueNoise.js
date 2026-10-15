// Holds the committed 64 x 64 toroidal void-and-cluster rank table that selects ecosystem lattice sites, and the deterministic generator that reproduces it.
// @ts-check
// Design: every lattice site of every layer reads its rank from one tiled 64 x 64 table (Ulichney 1993 void-and-cluster with a toroidal Gaussian of
// sigma 1.5 texels), so a site is kept when its rank is below the local density and any density threshold yields a blue-noise subset that is seamless
// across cells and stable under local density changes. The table is generated offline by the landscape/ecosystem/blue-noise bake leaf and committed
// here as base64; the leaf regenerates it with the parameters below and refuses a difference. The generator quantizes the Gaussian kernel to integers
// so every energy comparison is exact integer arithmetic, and ties resolve by texel index, which keeps the regeneration bit-identical across engines.
import { landscapeNoiseHash } from '../../../graphics/engine3d/landscape/LandscapeSurfaceNoise.js';
import { requireCondition, requireInteger } from '../internal/LandscapeValidation.js';

export const ECOSYSTEM_BLUE_NOISE_PARAMETERS = Object.freeze({ id: 'ecosystem-blue-noise-v1', method: 'void-and-cluster', size: 64, sigmaTexels: 1.5, seed: 599, initialOnes: 410, kernelScale: 4294967296 });

// --- committed table (written by node tools/bake.mjs --target landscape/ecosystem/blue-noise --publish; never edit by hand) ---
const RANKS_BASE64 = [
    'SAnzAe4NzAnODswBcwyEBGsKRAXhDBABUgepCowMMw53B9AKDgznBXgJHAtqApEM3gdBDXkBtwQHB4IP/QEeCAsPnwJPCuwH',
    'QAvrDKMDZQ4QBk4Etwe/DIMIjgqKAasENQeMCX0NcQu6D+UHaQP2CS8CQAzdACgHEgy1ChoE3QyrD70DJAfTANYEUwkAA4QH',
    'rA9wAicITQTODYgCAwXfCOYD+AFICMQNBQOdBz4PjARFCVcGGg+jCqMCHwnuDLIKIQW2BjQNIAMVBkoBBwoaDD4JywHCCsMC',
    'tA4jBUUMfw4rCwgDawShARUKZwXrCxEPjQRpDW0KvAXhDqACUAhMAegFFAr/CxQIJg25BucNJQt1AWYJRQ4NC9sFnwkyDzYA',
    'SAquDr0E9QDMDE8FowCQDTsD8gGcC6sHdA7aBZEDawA0DOUIMAGCDqkIUA9UAvEE/QfsD0YNbwadAHoHdQJlCMwA9g3pCBMH',
    'twwWAI4GXQETCCQD8ghqAZ8Elg2xBl4MxwK2BAcPUgLOCqYDXQBzBa4MaAZmA28AJQzPAfEGvgwiBsYLJwekD4EKqgjMCyIH',
    'ewo5Dk0FwQPeACAK0g2XB54PBATtCgAF1AvoAx4H4Q0ZACUDgglgBMALywllDQ8EpgYfDIIFJQ9IA2sOLAkWC8UNaQZJD+AL',
    'uAfhCSEAHQsLCecMfQD9BTgO3gk2D+AIKAT1DkoKMwfZD38IJAQFDj8BKAOpCQ8CSwaYA8YBbA/tBRUAegkdDUoI8QvcBIMC',
    'tgnlAcEN7wZ1ACcKawwUCfgFlgtHBwAO9QEND8kF8wqzDzcBMAr+AWkIpgRJDMwCKwVfAJ8K4QMWAnwPFwWPDj4BoAYJC6cI',
    'kgTIATIHIgwaAW0IAAIPDTUFsAJbCwAKGwXACOINbARpDKwOXwlRBC8IsAxhAu0PTwZOAekOmwZUC4oFTgjuAskPowXWAfQO',
    'LgQSDSkBbQVuCJ0DZwBYCeYCBgj/A6QNzQo4B5oB7g/1CWoHQg70BboMWQg+A0gHYA0HBH8PDgMRDTcGQQvZApUNugWbC7gD',
    'IglIDnQBsgeHD54MYAAXC3AHuwDHCnYNBgMUC/oGPgR4Cg0D8AjCDEUAuw71DKQKmweBDXEDKQisCnICrQmiD5kKfgyPBxwN',
    'JQWUDvkL/gWQABsNrQWECLQDigxFAlAJ5ABcC+YNaAqEApwHbgnKC8UANQipD/cE0Am9B8oOswDKCukFPAx3A5cGIgIuCGkF',
    'IA6ZAtMGngUYAcUIxw6PAccLwA2pBHIHmwM5Cb4BVgQiAXkJhwvGAKsGUw7UB3wEqAJZBtMO3gFCC/sGVwKmCVYP+QJjCycO',
    'ugAjCwgFMw/UBpEEqwG0BXQMzQ6OAYUFgQ6lCawDPwBkDlECYQTYBnAPDggSAGENXQSYCxIPTwMyCgcJxA+rC1sO0ARNDOoF',
    '3weoCQABsQ8nDDAFxAbwC4AOJgasBHoPVQwtBVoAmg3uCwkB+gmWBP0ILgDHDXAINASJB80JhwTPBq8NCwhuAyANwAm2D3cI',
    'fgDsBMkK7QaVAoANbAcICycGoQxqCisN/QLABDQKfQ6KCLUJHwZYAV4NoQSWAaUDKQcoCmIAiQM6D3QCjgXvCkYC3QkCDwkI',
    'oQLqDJkI8AHuCS0DNQuiCNwG3QNmDQMG4A96A8MLbgUSAZMMuwGID6kChAmTAeAKVgCwB9MDfQs6CQgOcAO4CJAMLQFaBSoM',
    'GgmMATAI+QCDCQoM9gEVB9oC5wBdDLwK5geUBrYMcgg+AuoNFQlLDaIK8wZPDlgIJQ0sAYEDBwseAGEKtQPzDZYHMgaqDr0B',
    'bQ/iCucHSQJ8DGcKyQbBDr8KDA48BlYI0Qt9BbUORAZHDHIOogIwBlQHBAKlC+oPaQQ2CggPxALwA8wPJAUoDpEG8Q6uBecK',
    '7w9GBQkO+ANeDyQAcwr9DmULNgRbBtABxwSODDcA3AMzBqYHuw3LBb4PNwdHBWwLnACjDEkEyQlUBf4CIg7AAFcIdgRXAcAC',
    'xgj6BJcDUAoRAF0NHwTtCBoCHgUZCjkNCgTPCRYGEAAfCJIG3wFxCCcN8gZvC2UCtwPRCLUAdgxsAxYJZQcGAnEJMwPMBOEF',
    '/wDwB9EPAgyHCPoCXAmECmsPnwuQBBwJAwNIDUEByQ4mCXMCygcEDSMAHgnIC1EGUQ2NCVsPrgchDcEALwz/DnsH/wKXCuEP',
    '/QagC6QAYA9uAYEMrQ4jA8kNLAtvDM0FWgpPAMIN8gcMC/8MdwTIB6YNZQDoCwsG8gw4CxwO9QhnDREDEwqgAM8FDg9zDS4F',
    'mgLZAPgJ0gE1DEIINwqqBs4D5g9fCggGZw5JB0MELg8SA2UFDwz6AyEKsAYxCeIBVQW1DDoI4wDeAwoOAAigBc4I9Aq0B10F',
    'mQkFBM8AAw4MA4sEsAlRAZwFQA/YAawJ3wWmCo8Eww43CL8AAwchAhEMVwdLDlUEJwsxBzgB7wecDEQO5AbPDg8GcwQnArQN',
    'MQWxCxwBRAM5CyYC6wkmAdIKYwdBACwOEALPD0wD4A1oC3UGSAJ0DT0J3AoLA9wMiQTNAq0A7ww8AiQPRAf3CI0PBQyfBqkO',
    'SwNJCtAGQQ5/AkwPZwEOCrgCaAWMD8sDVwovBeYBUQmwDS4CHAweBN4IeAU1A4MKgwCFDyILkwh/AS4HOw2zCE8P7gR4DI0I',
    'hA59AoILXQbiBPgKQwhyBHkA4gkwD+EEDQbZAccGUg6nCxkHoQ+TCq0IqgWTC7IBOQUhCF0C0wzqCCAADAzSA4sIXAwsB+sD',
    'Kg6LC2EJBQ09AaUGZw8HCH0DgAY9CusPVABiC9ANgAg6DU4HYANuDCkPqwkNBL8FiQCdDcAGYgPFBekM1QdlCYMN0QDGDD4H',
    'wA6fCFkDNwtgDJkPCQrlAL8OQAnVBRwEQAEpDTwDHgpbDYQAMAsrBJgH0w/9BNQKCwF1BVcJIw1CBsABzwe5BBMOxgqGDBgA',
    'tAvEDlEF8QKTCUEHegFjBIUCuwkdBaUAKgbYAm0O3goaCCIKuQHaD74J/gAwBDgPCQPyBREKuQK4BSINmwFWBykAOgRVCGYF',
    'tQFeA+8N/gv7B3YO9QZxBKIOcgZWCToO4AX3AYgN0QcEDuECpw8yAPkKhgM+DIEAggh+AicEBwbFCZIBYwgVDs8M+wRODwMM',
    'PgbUDD8OjAq/B+cLpwGlDJICRwT7C/MHDQVNDooKtAHCCFoMkw80AbcLFQRmCnkOCQmjDacC9Az3By8LNACKBsUCuQrUAL4I',
    'KgLvC4oDcQEcCrILIQNMBvEJhAtoBJ4H7whoDq4G2w+GBYAJkA7DBw0NlQQ+C+EAdwYoAkAI6QoPAMgICAIqBO8OGAlDBRYH',
    'bw8pBtkNDgBuC60CgQbhC8kEWgfPAzgJVA4ZCGcGPwKNBYoL5QZ/CtgPJwVKDQEKPQ8BBXkM8A9cClMF9g74BjgNhQQ3CbQA',
    '6A7dAfMFZQxDAt0E7wntAioLhw25AC8DLA9EAk0HQgwBBGUKmw6pA5MHaQ++BZELEQF2A3oNaQBtCaoKVAMhBy0Jlw0NCMwO',
    'kQDdDTEC1wogBXMAaA8BC8YDFw+hABgEEAl8AnMH8gOqAX4INQZTA1UHLwGpDIwIdgBXD3wHAg0GBGII0w0rCj8PogAWDR0I',
    'cwEKBwIF1wvLCHIKqQWlDycJFw0rAV8FmA3yApsJHg2tBmQK2AeFDuQEUAHwDu0MbQR3AaQDqwUlCVkLOga+BzsMKwPEDIgI',
    'TwGdCUwMUgZTAcsLLw5gCd4MPAuUAMoNnQuFCUgEzwJ9CpMFEwJtC7EJ9gbbAFcDbwV/B5QLPwSxDlkM+wlqBicBHQ50AzwA',
    'xgeyApMG9wkbDFsBSgeYBPEPhgJPC8UDKwy7CEICiAXpCcEP/gr6DOgBQw87BHwNrgGyCe4GbwS/DccHxgKTDl4K2QZxAIkF',
    'pAL5DlsEPwhfAu4Fjw97DZoGCAwWDv8E6QLyD9AMwQsTCT0OjwIjBhsJrQMZAnUPSgQgCGQNDwsqBcwNkAsFCGQEtg64CkwA',
    'eginBWUBLA0dBm4H8Ap3DM0GewCsCC0HGgP+CS8AzQi9D58FMQ5TAqYLBgbYBP0MQQOkBIMPBQvqB40GQwpODpcMDQAYC6gH',
    'IAG2A6EIOQAAC94FpQH3A6EGYwE+CpgP9gBEDWEH2ArNDBMGewGICeYO4wOGALsPHgLPCHgDRg6kDAIKCg/5CNUCkQ/aANoD',
    'ag7CAhAMdQSgDYAF1gu9BpYDLQvQAFkK5A4MAOwJGAi8DogMAQnaAbMNXwNGAeAEDAc0AwMJzwR3DsQJYg/WBq4NSwnjBwkP',
    'Lgu3DbEELQg9C7AFxg5RAEwJ1wIoDMYG7AGaB2QJwQWWDHAGUgs4BboB6AZCBIoAOgq7BHkNbwnOBwUFUg9oAcEK7gfSDmkC',
    'nww2CM4ENAemCLIDfw3DAXkF8wCBBwsEUwxrCcoPBAzSCecOBw00AuYKhwGBBT0MNwRYAl0KGgXeApAHCwDFDGcDQQLECAcF',
    'vwOGCvMPkwToDOwK+A0pA0cKpgCGDSUI5QLjC6wNywefDtoLeAb8AZ4LHwpFBuQIHw7cALUEUglDARMPVg3BAgEMZQ+6BvUK',
    '5Qt0BhEOugpLBb0APQj3Ba0BLQQVCDYGZgxkBxUDagj6AHwO/AyrAIUMaQlABosO8gkdB9ALCQ1MDsEH1gBsCL8CMQZ4Ad8E',
    '1Q54BxcEkA8wCd0F6gp8A5gFGQFaCFYDEg4iANgMgQLxA+AGRQ2lCgEGAwS6CVAGowEEBT8JqwLeD3sDuAlKAo4OAgdIC6YC',
    '+g2qC7AAtA+nA5QNcQrYDo4LNgfvBUkIqA/qA/0LuAHCBMMPBgGdBgMC4gWDC6ENtwlED2QLAgkIDUwCwwlyAWgMGwBvDjcC',
    'SgnWDJYK1Q/lBSkElQe+DpUJFAz8AucP8QfJC0kAjQ62CscMjQDZB7wEcQwqAJ4IuAxAAycPowS5CLsGiQpJBX4JRgAiBYcC',
    'YwmUBPYCCwteAZ0FYArWB0ANHQnsA1cLGgrUDkYDVgUTACIE3AcFAbcG2QsABqgOBgdPBAYKgAcVDxsE+QaVARcJNwyrCq8B',
    '3gTJB5IAVwXrAegNHQOyCCoH9AM7DgMKhAFLB+wOMwRNBk0JbgA/CjINRwGRDnECTwgPDx4MZQapAV0PSQ2gCQIObQLeDjkD',
    'iADEBdYNywKiByoB1QgJDBQH7A1kDIwD3A+KBOUKTgOkCHUNYwUBAfoKugLjDTIFbA3nAqwGlg9JC/UNCAqrDOYIzgYhC0IF',
    'nw8YAvEFcgviCM8NJgVWC80Bjw3bC7cFrAeVAy4McQZfCxYEoQdRDlEKDAgsAAgEZAaVCKILogZfDJgKQQgWD3EFMQ14BJQP',
    '8wmAArIFWwq9CNUBAQ6sAFYKIwJZDzkMEQaoCIUL3wDjCf8HmAB/BYsDXwGLBlED1g6ABIkM6wDfCTIIGA0UA2YGgAqTAmEI',
    'xg/rBu4DWgJ0D3YJ1QSpDcEBEgriAC4DrQyLBXMLggebDNcAmQReCXIPBQKyBEAAqQtOCSsCOQZNATQI/g6MAHENewWgB5kM',
    'FQWNCxIIMgMjDtcBWwc0DzwEbg6SDFQJkQ0RCFwPegtoAJwJkAKFDbAD4wpCAVEPxwN/AFgMqAUhAbsKpQjDDYMBHwtkAFAH',
    '4g/QBdUNBglaBIEBNg4KA/QPbAqxDVQB1gMgB/cMRArVBoIDVQ6zCkwNjwswA+kGNgvUAoEJew+uA4UGagCqCYYEggrODEUD',
    'KwZ0CnkC5wYEC1gERwKzBUsIGw5OBusHrw7dBmIFpAsiCNwOfwk+DScDiQ4GBVAMRgYmCLIMXAO8CEsC9guWBnkPnQpWBtQI',
    'DAUsAuQFBAhTC0kO3Qh4AsIPSAy4AJ8H2QMzBS4JyQxQBFAOQQYPAZwIng7+DEIH9Q+VBSUANQn0CzsBCQUQDzgAtgg9DVgK',
    '1wPyC7cBxAQjDBoAYgl3DckBOgclBHMGTQqzBwoAlwnTAlcOhwVBCi4NwwTRClMAuge1AkINnwAHDJgJ+A6LDO8CQQUNAVMG',
    'YgR9CLUFvAlBD0QAlg4HAg8IfgENCtgLawK9CgAEkQHEC7ECog0IB24PZAg2DToDMww9BqcOFAEvB3cPfgraCDcD9g+NAtcE',
    'GA47C8QAkg8cAvMLyQPtDs8KXwTOAQUP+wDtBzcOuwOPDMgJtAQgD9oH7QPKBmEAngpGCcIOHw2NCsIBpQ3WAhkMWAd6CscF',
    'SwwdD/UEiQ1iB0wF+AgXDiwGdgg4CmoE1AG7BcwKgwf9CQwCywS5DAEDUAW+AC0OGgtoB98MSwpaA48FYgxeCOgE2g2vBpcI',
    'CgGGB90LIQnBBr4ChgnABdAO0wH/BhMLnQFwDrcCgg1nBzIElQsYAw8H4g5pC0YEYAZtAd8NbQPrCN8GCQCFA68PRQG8DCID',
    '9grJAJgOFgNOCz4OywBFBOUP/giZC7wHowmNDTwIHAYZBHYB2AWGCGEP2gnbAl0Ocwk6AQ4LXgXID2sNDAbVA6oMpg91C2sB',
    'jwjPC2UDQQnUBa0L2QlhBdIP+wEoCB0Aigk6BfcAqwjoD30JyAS5C3cCyArzDFUJQwsUBhcKwgdkDw8FXgeDDG4G7giXAowN',
    '1wV8AI8DFA+mAVgLnQKoDNUJ8g4GDFgALw16Bh8BGweiA04NXAKNDFADhwk6AusKKwBkBQkEXAerDfYEyw8IANwNLARHCMcA',
    'JgxrBtcMRw+eA2EMdgfACgECfQytBwcBhA+vBSEE+QeuAl4OhwB0BDICEA3OCTEBow+4BC4KWwwBB2IOdwp0BcMGXgSOD3gA',
    'GgfRAvYHjgQtAuQKOAiwC0sPGQbwCaMHbQD8BP0NWwiSDv8JCw2yAHUKZgKJBmcMfQcRAjcNywpjAzQJeQSHCigGMA6sAlgN',
    '5gWSA/8NEApECJsNzQDgDhkFRgzQCNsNgQsbBsADRQgdAtIL+gegA7wBkAigDEQBpw1nCakH2wpYBQ8OVQtPCaQO/QPNDRQF',
    'qgBmCC8EuA6FCiEMRwaGASYHEAPXCB4Gug5SCNoKvgOPCV8PCwUFBwEPFgHUDe4BXAiXAL0JXAT3DjMAvAYQBQ0C3wuoBqEK',
    'rAE/B10DmQZ3CUcAhw58CssNfAUHAFUPEQuaBOIC4AeICw8DQw7hATUNqwMVAQoGAAxgAQUK9QK7DBULvwEqDdsGrwOaDxIL',
    'vwQVDGoPIAJLBB0MFwFADgUGXAFCCk8CuwuhBWAHdAvKBKoP3gs5B+gIcAoWDLIO9gMPCZQCXw2OCd8PGwvKAQQP6gQkDIMG',
    'GwOOB7QMRAnwBRkOvwm1D1cAFwYTBP8InAbkCdcPfgf8CIMFGA+4BjsJ9w/MBdACwQjIAEMJnAJaDegAtQcbCk8NlgWlB90C',
    'pgxnCJoO9QMXCFoO6gJoDVoJmAZJA5QBDA2YAiMIaQHFCnEP2QUICGUErgCUBUMNpAfcAscI7ABgC9kONQR7AjMN6gD+BikF',
    'Dg0lCkoPrwunAMEMqATwAjUAJA3EBwICWQRKAM0H6gvrDkoFuQ3mBqQJpAWaC5oDUABZCYkP2gQzC0MAlQYBDXwJlQBVCgwE',
    'KAEaDpwKmgVUD24EAgZtDRIHVQDsDDYDJg4LDHQI5wNjCrMMwA+lBMEJgAGFCMIGLwr+A14LiQJRCKQBUQf0BJsCuwfxCvIN',
    'OQqEAygLUQzeDZUKWQ5+BNsJDgJBDBIEMQ//AdENzAZYDv8KxAHDCO0NmQOUCucBFgX4D0oGygz1B04CSgyjCHAAiQthDiwD',
    '6AnzBEoLngE1CnwGMAJWDpMAuQU7Al8HNQ6sBToMZg/tAWYO4winDKUOnwM/DMgN0wjLDuMB6wWgD8YEHQGaCJcFWwPiBjUB',
    'gAtcBukHHwCYCNYKoARNCJYCQwYjBA0MTAfDBQMP7Au5B4ICfwsECVkFdg9tBtEDOwptBzIJHgGiDF0I/A4wB9EEfQ8ACWsL',
    '7AaeCb4LFA1CA8QKjwDpBJcLigepALAEfQbdChcAJQYzCnIDgAwNB2wJWQ1VBioPWwKQCeAMewjzAloPoApxDj8DwAzVALAP',
    'xwnaDLAOygCvArQJGwHbCGINUwRKDhQAVQNFCwIBsw5UDekBPwX5D4QGEgKUA3IJcgwGABMDlwQeD2QBIASOCLYBJQd+DWgJ',
    'vAL2BWkK+g8fAhIJOAQ8D0gBNAV5CLwAtgvHAZIHVAotDPQAuQ8xBGMNkgWxAc0E4An8BUUHUQtwASwF4gdTCscPdQzSBPgC',
    'vwZVAZEKaweEDcYJGwj5BNoGaAM2DK0KVATlDc0LbwG8DS8GkgqVDBAIcA2IBnsOTgqbD+UD/gfuDlwNQwMXDPwGFA6oC4gH',
    'FQ1ECwAPEQT8B/sCXw7NAw4F3Qf/BUYKZgDnCIcMeQe1DT0C3Q7CA8kIBwOsCw4G4AOHB74NWgtzD5YJcgXIDoIEnAHbDJ4C',
    'EAs0DrEIOgDMBwsKkQWbCPMDlAdgDukAkAVnAjQLMQAKBSEGJQKUDE4A0wSSCCMB9Ak7BagBAgN1CaQGbALpDQoKxgWCDAUA',
    '9wqLDSkCrgsABzwOvAN2C4AACgkyDHAFLg4DDQQA6w3xAQwJdwDcBVMInAN/DDgC9Aa/CzYJKw/FB2YB+wU/DZECiA7uALcP',
    'PwsLAkkJfgMqCvsP3AhYA9EMJAmGC94G5gk6Cy0GHA+zA1MNgQiXD5wEYwDDCu8ECAHFDykJCQcZD7UIawPXDvAE+QmMAkgG',
    'lw57BIsKEwGpBhYKfwR7CY8GmQ6PCmICGQ0EAdMKvwjWD3kDmQWoAHoE5wmADw4EfAtAB1IDhgbIDOME6g6zC08HQAQxDI0H',
    'IQ8OAQcOqAOgAZwOQAJqDK8HmQDhCmIGbQyKDhcHGg3fA2YLVQKvBH0BWAZ6DKIBKgjSAJwP/QpUCN8Ctgf8D2ACAwgMD3gL',
    '6wKYDLoERQ+qBygFJQ4/Bl4AQAqODb4GEA4TDNwBBQlIBfsMWwmQCkgAbwjsBYsB/A2WAM4F5AEPCrMEKwh3BcMMKwdCCX0E',
    'MQq2BR4O+QGNA9cJiAG6CCQG0gdHDa4K9w25CRAEMgu4DZ4GvQwSBZgBVw3RBSQLrAy6A5ABUgV4CCUBEQeHAzMJvAsUAvsD',
    'Ew3QB2QCvgqRCOwCXgYCCyQBvQ4zAnAERg/JAngNywZwCdkK3w74DHkGpQKoCrgP2AgeA60NUgHND9ICGAwjCYUHWwWSC/MO',
    'xg1cAGoFHwMxCJsA4w+iBSgJCQLYA9kIPAofD4ADTQDhCIYOWQfmDL8P1glhC6gNMACgDtIGswnkC6IE0Q7wABQE1QyZByMP',
    'qgMsCCwMHwf8CvYI6QP3C2MCGAVKA9sHfgspDkIA5guFAesEMQvIBroLJAjtBDsAIg/SDBUCPQN2CvQI3AstDxgGRAyMB+gC',
    'sQovDzsH/AuxAIwGUgzCCacESQa0CnIA4gPjBfoB5gRuCioDawhjD4IB1gU8CXcLsg96BSYAkglvDRoGngBjDlwF8Qz9ALwP',
    'dAefDfEIWgFXBCoJcwNmByAGKA+aCXQAzAN+DgQKag1EBJsKXwjjBlkBdQ5SBC4B5Qk1AsEEKA0oAD4Fkw0ZA3MO1ASLB9gN',
    'SwH1C70C+Q0+CDAMuQ5xB68MdgXYAPIKYQNHDvcGygIKCCkK9A2KApsEXQvRCWoD6gHTB9gJgQQZC1sAYgqKDzANvQXbDtwJ',
    '2Qx6AtcH1w3KBeABDge0AmwG5gDkD+UE9gyOAlMHKQucDZQIgw5qCwIIJApsAaEJaAj0AUsL5AL7Dq8IPAUtCrMG7wANCaoC',
    'rg+RCXsGsg3hB2MMMgFQDdsE0QHiCxwHtAhhAekP1wbVCyQO+QU5AqYOpwZOBYsCQwevAE8MQQRJAWwOgwRDDLAK1giBDwML',
    'cAz7CG8DtQvTBXMIlQ9ABTgDtAY8AZMDBAahDmcEwgv6Bc4PIAk5BKMGywyzASYPHAOSDWYE+wpWAeQD0wtuAhMF1AnUAwYL',
    'eA6QBvkDNw+EDEUFTQ0dBC8JAwBNCwYNnQi5A7EMjAuuCLcKtgIBCFAL+giHBhcDAwHlDO8DMwF+BQsObwf8CZ8B0AOUCUsA',
    'VwxSCjsPdAl7DHYCEAdSDaEDPQC2DW8KwwDkByALqgRHCbgLGAfCBfsNsQflDuwIAgBTD/UFiQh6AGoJ1QrtAPcCIwroB1kC',
    'nQ4fBU0DRgcMAcoJTQ98AYgEvQ12Bv0PawUnAEUKOQ89BxwFYAi3DqIJ4wIBAHIN6AppDu0LfwYODgoC/gRpB7cAnQ/fCjYB',
    'MwidDDwHhAVID5ADIQ4uBhwAhg/FAfkM7QngAMUE4wynCiMHKQy7AtQP4gymBUwIng07BsIArwpsDHUIrQ+ICisOyAX0AuEG',
    'ow74AOoJZAOaDDIOTQL4C4kJ5A1vAoIGewu+BPoOxQbMCBEFaAL0BwIEEQktDUYLPQSWCIwF/g0mCp4EXgIKC5kBiwlWDFYC',
    'mgrAB44DoAjIAnALtQYbAoMDjA5iAfIEXQd1A9sBlQ7bA6ELeA+uBPAGjQFaBlACnQRODPgHRwsICT0FzguwAQQHJgQ5CNIF',
    'wwNZAEwKAA2JARwIOAx/AzUPmgAKDXkK/g/yAGEGzgK6DdMJRwPvAV8G2g7pC3wIVQ34BAsHyghuDdkE+gt6DmwF3Q87CPEN',
    'sQWwCBgKmQ0eC/MIIAzRBq8JFwLSCDwNMQOnCaoNowsrCT4Aig02AsoD5AwWCMUOXQnuCvAMlwF+D0wLpwdMBNAPCQYdCiQC',
    'kQdnC1QGJgObBXkLRgirDgAA6ga9C1gPDgmxA7YAEgbgAv8PiwDIA+MOOQF+BiwKUgDEA64JVAyOAMUL/AM4BvEADQ6tBC0A',
    'Gw82BXUHggAmCwYP/AClBYgDQg9jBgwKiw9sADQGswLnBM4A8A2yBrcINwVcDgQDGQmFAAYOYAU='
].join('');
// --- end of the committed table ---

/** Encodes a rank table as the little-endian uint16 base64 text the module stores. @param {Uint16Array} ranks */
export function encodeEcosystemBlueNoiseRanks(ranks) {
    const bytes = new Uint8Array(ranks.length * 2);
    for (let i = 0; i < ranks.length; i++) { bytes[i * 2] = ranks[i] & 255; bytes[i * 2 + 1] = ranks[i] >>> 8; }
    let binary = '';
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
    return btoa(binary);
}

/** Decodes the stored text back into ranks. @param {string} text */
export function decodeEcosystemBlueNoiseRanks(text) {
    const binary = atob(text), ranks = new Uint16Array(binary.length / 2);
    requireCondition(binary.length % 2 === 0, 'blue-noise table text must hold whole uint16 values');
    for (let i = 0; i < ranks.length; i++) ranks[i] = binary.charCodeAt(i * 2) | binary.charCodeAt(i * 2 + 1) << 8;
    return ranks;
}

/** Throws unless `ranks` is a permutation of 0..size² − 1. @param {Uint16Array} ranks @param {number} size */
export function requireEcosystemBlueNoisePermutation(ranks, size) {
    const count = size * size, seen = new Uint8Array(count);
    requireCondition(ranks instanceof Uint16Array && ranks.length === count, `blue-noise table must hold ${count} ranks`);
    for (let i = 0; i < count; i++) { requireCondition(ranks[i] < count && seen[ranks[i]] === 0, `blue-noise table repeats or exceeds rank ${ranks[i]}`); seen[ranks[i]] = 1; }
}

/**
 * Regenerates the rank table: an initial pattern of the `initialOnes` texels with the smallest hashes, relaxed by swapping the tightest cluster with
 * the largest void until they coincide, then ranked by removing clusters down to zero and filling voids up to the full table (the void-filling phase
 * and Ulichney's inverted cluster phase coincide for a toroidal kernel of constant total weight).
 * @param {typeof ECOSYSTEM_BLUE_NOISE_PARAMETERS} [parameters]
 */
export function generateEcosystemBlueNoiseRanks(parameters = ECOSYSTEM_BLUE_NOISE_PARAMETERS) {
    const { size, sigmaTexels, seed, initialOnes, kernelScale } = parameters, count = size * size;
    requireInteger(size, 2, 256, 'blue-noise size'); requireInteger(seed, 0, 0xffffffff, 'blue-noise seed'); requireInteger(initialOnes, 1, count >> 1, 'blue-noise initial ones');
    requireCondition(parameters.method === 'void-and-cluster' && sigmaTexels > 0 && kernelScale >= 1 && kernelScale <= 4294967296, 'blue-noise parameters must describe the void-and-cluster method');
    const kernel = new Float64Array(count);
    for (let dz = 0; dz < size; dz++) for (let dx = 0; dx < size; dx++) {
        const wx = Math.min(dx, size - dx), wz = Math.min(dz, size - dz);
        kernel[dz * size + dx] = Math.round(Math.exp(-(wx * wx + wz * wz) / (2 * sigmaTexels * sigmaTexels)) * kernelScale);
    }
    const pattern = new Uint8Array(count), energy = new Float64Array(count), ranks = new Uint16Array(count);
    const toggle = (index, sign) => {
        const px = index % size, pz = (index - px) / size;
        for (let z = 0; z < size; z++) {
            const row = ((z - pz + size) % size) * size, target = z * size;
            for (let x = 0; x < size; x++) energy[target + x] += sign * kernel[row + (x - px + size) % size];
        }
    };
    const extreme = (value, largest) => {
        let best = -1, bestEnergy = 0;
        for (let i = 0; i < count; i++) {
            if (pattern[i] !== value) continue;
            if (best < 0 || (largest ? energy[i] > bestEnergy : energy[i] < bestEnergy)) { best = i; bestEnergy = energy[i]; }
        }
        return best;
    };
    const hashes = Array.from({ length: count }, (_, i) => [landscapeNoiseHash((seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    for (let i = 0; i < initialOnes; i++) { pattern[hashes[i][1]] = 1; toggle(hashes[i][1], 1); }
    for (;;) {
        const cluster = extreme(1, true);
        pattern[cluster] = 0; toggle(cluster, -1);
        const empty = extreme(0, false);
        if (empty === cluster) { pattern[cluster] = 1; toggle(cluster, 1); break; }
        pattern[empty] = 1; toggle(empty, 1);
    }
    const initialPattern = Uint8Array.from(pattern), initialEnergy = Float64Array.from(energy);
    for (let ones = initialOnes; ones > 0;) { const cluster = extreme(1, true); pattern[cluster] = 0; toggle(cluster, -1); ones--; ranks[cluster] = ones; }
    pattern.set(initialPattern); energy.set(initialEnergy);
    for (let ones = initialOnes; ones < count; ones++) { const empty = extreme(0, false); pattern[empty] = 1; toggle(empty, 1); ranks[empty] = ones; }
    requireEcosystemBlueNoisePermutation(ranks, size);
    return ranks;
}

const COMMITTED = decodeEcosystemBlueNoiseRanks(RANKS_BASE64);
requireEcosystemBlueNoisePermutation(COMMITTED, ECOSYSTEM_BLUE_NOISE_PARAMETERS.size);

/** The committed table: `ranks[(sz mod 64) * 64 + (sx mod 64)]` is the rank of lattice site (sx, sz) in 0..4095. */
export const ECOSYSTEM_BLUE_NOISE = Object.freeze({ id: ECOSYSTEM_BLUE_NOISE_PARAMETERS.id, size: ECOSYSTEM_BLUE_NOISE_PARAMETERS.size, ranks: COMMITTED, parameters: ECOSYSTEM_BLUE_NOISE_PARAMETERS, text: RANKS_BASE64 });

const SIZE = ECOSYSTEM_BLUE_NOISE_PARAMETERS.size, MASK = SIZE - 1, SCALE = 1 / (SIZE * SIZE);

/** The blue-noise rank of a lattice site in [0, 1): `(rank + 0.5) / 4096` read toroidally. @param {number} siteX @param {number} siteZ */
export function ecosystemBlueNoiseRank(siteX, siteZ) { return (COMMITTED[(siteZ & MASK) * SIZE + (siteX & MASK)] + .5) * SCALE; }
