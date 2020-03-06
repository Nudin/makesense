## About the project
[Lexemes](https://www.wikidata.org/wiki/Wikidata:Lexicographical_data) on
[Wikidata](https:wikidata.org) currently often lack their *senses*. For nouns
we often also have an item corresponding to the senses. This tool provides an
easy way for the user to add senses to lexemes that are probably a match by
just clicking a button.

## How it works
The tool searches for such possible senses for existing lexemes using a
Wikidata Query that matches the lemma for the lexeme with items with same label
(in the same language) and adds them and the descriptions for the items to a
database.

The flask based Webgui then allows users to login with their Wikimedia account
(using [OAUTH](https://www.mediawiki.org/wiki/OAuth/For_Developers)) and be
presented with the potential matches.

If the user accepts the match, the description of the item will be added as a
new sense and the item itself will be added with [P5137 (item for this
sense)](https://www.wikidata.org/wiki/Property:P5137) to that sense.

## How to use
The tool is running on Toolforge:
https://tools.wmflabs.org/machtsinn/

After logging in, use the buttons *Save* or *Reject match* to decide if an item
really corresponds to a sense for the lexeme or not. Edits to Wikidata will be
made in your name.  If you are unsure if it is a good match, click *Next*.

## Statisics of usage
You can finde usage statistics here:
https://tools.wmflabs.org/machtsinn/statistics

You can also follow the recent changes on Wikidata using [this
filter](https://www.wikidata.org/w/index.php?hidebots=1&hidenewpages=1&hidecategorization=1&hidelog=1&tagfilter=OAuth+CID%3A+1427&limit=50&days=7&title=Special:RecentChanges&urlversion=2)
on Recent changes.

## Contributors
* @Nudin
* @Incabell
* @DDuplinszki
* @Ainali
* @so9q
* @dzarmola
