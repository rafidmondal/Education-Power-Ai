import React, { useState } from "react";
import { 
  Calculator, Search, Book, Globe, Library, Award, HelpCircle, 
  Smile, FlaskConical, Languages, Bookmark, Compass, Send, Loader
} from "lucide-react";

interface ToolsPanelProps {
  onSendToChat: (text: string) => void;
}

export default function ToolsPanel({ onSendToChat }: ToolsPanelProps) {
  const [activeTab, setActiveTab] = useState<string>("math");
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  // MyMemory Translation states
  const [sourceLang, setSourceLang] = useState("en");
  const [targetLang, setTargetLang] = useState("bn");

  // Math solver operation selection
  const [mathOp, setMathOp] = useState("simplify");

  const tools = [
    { id: "math", name: "Newton Math", icon: <Calculator className="w-4 h-4" />, desc: "Simplify algebra, compute derivatives, factor binomials, or calculate integrals." },
    { id: "dictionary", name: "Dictionary", icon: <Book className="w-4 h-4" />, desc: "Instantly retrieve phonetics, synonyms, antonyms, and multiple definitions." },
    { id: "chemistry", name: "PubChem", icon: <FlaskConical className="w-4 h-4" />, desc: "Search chemistry compounds to discover formulas, smiles, and weights." },
    { id: "translator", name: "Translator", icon: <Languages className="w-4 h-4" />, desc: "Translate text phrases securely using MyMemory translator." },
    { id: "wikipedia", name: "Wikipedia Summary", icon: <Globe className="w-4 h-4" />, desc: "Fetch concise encyclopedic summaries and illustrations." },
    { id: "countries", name: "Rest Countries", icon: <Compass className="w-4 h-4" />, desc: "Search country profiles for capitals, populations, currencies, and flags." },
    { id: "arxiv", name: "arXiv Papers", icon: <Library className="w-4 h-4" />, desc: "Search through global physics, math, and computer science research abstracts." },
    { id: "books", name: "Gutenberg Books", icon: <Bookmark className="w-4 h-4" />, desc: "Browse through massive collections of classic free public domain books." },
    { id: "trivia", name: "Trivia DB", icon: <HelpCircle className="w-4 h-4" />, desc: "Fetch pre-made trivia question sets for study flash quizzes." },
    { id: "jokes", name: "Break Time", icon: <Smile className="w-4 h-4" />, desc: "Read a funny developer or science joke to refresh your mind." }
  ];

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query && activeTab !== "jokes" && activeTab !== "trivia") return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      if (activeTab === "math") {
        // Newton Math solver
        const encodedExpr = encodeURIComponent(query);
        const res = await fetch(`https://newton.now.sh/api/v2/${mathOp}/${encodedExpr}`);
        if (!res.ok) throw new Error("Math solver is currently offline.");
        const data = await res.json();
        setResult(data);

      } else if (activeTab === "dictionary") {
        // Free Dictionary API
        const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error("Word not found in the dictionary.");
        const data = await res.json();
        setResult(data[0]);

      } else if (activeTab === "chemistry") {
        // PubChem Search
        const res = await fetch(`https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(query)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES/JSON`);
        if (!res.ok) throw new Error("Compound not found in PubChem directory.");
        const data = await res.json();
        setResult(data.PropertyTable.Properties[0]);

      } else if (activeTab === "translator") {
        // MyMemory Translator
        const res = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(query)}&langpair=${sourceLang}|${targetLang}`);
        if (!res.ok) throw new Error("Translation system failed.");
        const data = await res.json();
        setResult(data.responseData);

      } else if (activeTab === "wikipedia") {
        // Wikipedia page summaries
        const res = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error("Wikipedia topic not found.");
        const data = await res.json();
        setResult(data);

      } else if (activeTab === "countries") {
        // Rest Countries
        const res = await fetch(`https://restcountries.com/v3.1/name/${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error("Country profile not found.");
        const data = await res.json();
        setResult(data[0]);

      } else if (activeTab === "arxiv") {
        // arXiv Papers search (parses simple XML atom feed client-side)
        const res = await fetch(`https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&max_results=3`);
        if (!res.ok) throw new Error("Failed to load arXiv search results.");
        const xmlText = await res.text();
        const parser = new DOMParser();
        const xmlDoc = parser.parseFromString(xmlText, "text/xml");
        const entries = xmlDoc.getElementsByTagName("entry");
        
        const papersList = [];
        for (let i = 0; i < entries.length; i++) {
          const title = entries[i].getElementsByTagName("title")[0]?.textContent || "Untitled";
          const summary = entries[i].getElementsByTagName("summary")[0]?.textContent || "No abstract available.";
          const authorsNode = entries[i].getElementsByTagName("author");
          const authors = [];
          for (let j = 0; j < authorsNode.length; j++) {
            authors.push(authorsNode[j].getElementsByTagName("name")[0]?.textContent);
          }
          const pdfLink = entries[i].getElementsByTagName("id")[0]?.textContent || "";
          papersList.push({ title, summary, authors: authors.join(", "), pdfLink });
        }
        if (papersList.length === 0) {
          throw new Error("No research papers matched your keywords.");
        }
        setResult(papersList);

      } else if (activeTab === "books") {
        // Gutendex e-books directory
        const res = await fetch(`https://gutendex.com/books/?search=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error("Free books directory failed to load.");
        const data = await res.json();
        if (data.results.length === 0) throw new Error("No matching free e-books found.");
        setResult(data.results.slice(0, 3));

      } else if (activeTab === "trivia") {
        // Open Trivia Database
        const res = await fetch(`https://opentdb.com/api.php?amount=3&difficulty=medium&type=multiple`);
        if (!res.ok) throw new Error("Trivia database failed.");
        const data = await res.json();
        setResult(data.results);

      } else if (activeTab === "jokes") {
        // Programming Jokes
        const res = await fetch(`https://v2.jokeapi.dev/joke/Any?type=single`);
        if (!res.ok) throw new Error("Failed to load a funny joke.");
        const data = await res.json();
        setResult(data);
      }

    } catch (err: any) {
      setError(err.message || "An unexpected API connection error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const sendResultToChat = () => {
    if (!result) return;
    let textToSend = "";

    if (activeTab === "math") {
      textToSend = `Math Problem solved locally via Newton Math API:
Operation: ${result.operation}
Expression: ${result.expression}
Calculated Result: ${result.result}`;
    } else if (activeTab === "dictionary") {
      textToSend = `Dictionary definition for "${result.word}":
Pronunciation: ${result.phonetic || "N/A"}
Definition: ${result.meanings[0]?.definitions[0]?.definition || "N/A"}`;
    } else if (activeTab === "chemistry") {
      textToSend = `Compound molecular profile for "${query}":
Formula: ${result.MolecularFormula}
Molecular Weight: ${result.MolecularWeight} g/mol
SMILES Representation: ${result.CanonicalSMILES}`;
    } else if (activeTab === "translator") {
      textToSend = `MyMemory Translation (from ${sourceLang} to ${targetLang}):
Original Text: ${query}
Translated Output: ${result.translatedText}`;
    } else if (activeTab === "wikipedia") {
      textToSend = `Wikipedia extract on "${result.title}":
Summary: ${result.extract}
Read More: ${result.content_urls?.desktop?.page || "N/A"}`;
    } else if (activeTab === "countries") {
      textToSend = `Country research profile for "${result.name?.common}":
Capital: ${result.capital?.[0] || "N/A"}
Population: ${result.population?.toLocaleString() || "N/A"}
Continent: ${result.continents?.[0] || "N/A"}`;
    } else if (activeTab === "arxiv") {
      textToSend = `arXiv Scientific Papers Research for "${query}":\n` + 
        result.map((p: any, i: number) => `[Paper ${i+1}] ${p.title}\nAuthors: ${p.authors}\nAbstract: ${p.summary.slice(0, 300)}...\nLink: ${p.pdfLink}`).join("\n\n");
    } else if (activeTab === "books") {
      textToSend = `Classic Public Domain Gutenberg Books for "${query}":\n` + 
        result.map((b: any, i: number) => `[Book ${i+1}] ${b.title} by ${b.authors[0]?.name || "Unknown"}`).join("\n");
    } else if (activeTab === "trivia") {
      textToSend = `Trivia Question Set:\n` + 
        result.map((q: any, i: number) => `Q${i+1}: ${q.question}\nCorrect Option: ${q.correct_answer}`).join("\n\n");
    } else if (activeTab === "jokes") {
      textToSend = `Take a Break Joke:
${result.joke || `${result.setup}\n${result.delivery}`}`;
    }

    onSendToChat(textToSend);
  };

  return (
    <div className="bg-bg-secondary border border-border-main rounded-2xl h-full flex flex-col overflow-hidden shadow-xl select-none animate-fade">
      {/* Search Header */}
      <div className="p-4 border-b border-border-main bg-bg-primary/30">
        <h2 className="text-sm font-semibold font-display text-white mb-1 flex items-center gap-1.5">
          <FlaskConical className="w-4 h-4 text-accent-tertiary" />
          13 Free Educational APIs Panel
        </h2>
        <p className="text-[10px] text-text-secondary">Execute lightning queries against reference APIs and inject them into AI chats.</p>
      </div>

      {/* Tabs list */}
      <div className="flex border-b border-border-main overflow-x-auto shrink-0 scrollbar-none bg-bg-primary/25">
        {tools.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              setActiveTab(t.id);
              setResult(null);
              setError(null);
              setQuery("");
            }}
            className={`flex items-center gap-1.5 py-2 px-3 text-xs font-medium whitespace-nowrap transition-colors border-b-2 outline-none ${
              activeTab === t.id 
                ? "border-accent-tertiary text-accent-tertiary bg-bg-tertiary/20" 
                : "border-transparent text-text-secondary hover:text-white"
            }`}
          >
            {t.icon}
            {t.name}
          </button>
        ))}
      </div>

      {/* Search / Run Actions form */}
      <div className="p-4 border-b border-border-main shrink-0 bg-bg-primary/10">
        <form onSubmit={handleSearch} className="flex gap-2 items-center">
          {/* Custom Math Operations selector */}
          {activeTab === "math" && (
            <select
              value={mathOp}
              onChange={(e) => setMathOp(e.target.value)}
              className="bg-bg-primary border border-border-main rounded-xl px-2 py-2 text-xs text-white outline-none"
            >
              <option value="simplify">Simplify</option>
              <option value="factor">Factor</option>
              <option value="derive">Derive</option>
              <option value="integrate">Integrate</option>
              <option value="cos">Cos</option>
              <option value="sin">Sin</option>
              <option value="log">Log</option>
            </select>
          )}

          {/* Custom languages translation selectors */}
          {activeTab === "translator" && (
            <div className="flex gap-1">
              <select
                value={sourceLang}
                onChange={(e) => setSourceLang(e.target.value)}
                className="bg-bg-primary border border-border-main rounded-xl p-1 text-[10px] text-white outline-none"
              >
                <option value="en">EN</option>
                <option value="es">ES</option>
                <option value="fr">FR</option>
                <option value="de">DE</option>
                <option value="bn">BN</option>
              </select>
              <span className="text-text-secondary self-center text-xs">→</span>
              <select
                value={targetLang}
                onChange={(e) => setTargetLang(e.target.value)}
                className="bg-bg-primary border border-border-main rounded-xl p-1 text-[10px] text-white outline-none"
              >
                <option value="bn">BN</option>
                <option value="hi">HI</option>
                <option value="en">EN</option>
                <option value="es">ES</option>
                <option value="fr">FR</option>
              </select>
            </div>
          )}

          {activeTab !== "jokes" && activeTab !== "trivia" ? (
            <div className="relative flex-1">
              <input
                type="text"
                placeholder={
                  activeTab === "math" ? "e.g. x^2 + 2x + 1" :
                  activeTab === "dictionary" ? "Enter English word..." :
                  activeTab === "chemistry" ? "e.g. caffeine, water" :
                  activeTab === "wikipedia" ? "Topic e.g. Quantum physics" :
                  activeTab === "countries" ? "Country name..." :
                  activeTab === "arxiv" ? "Keywords..." : "Keywords..."
                }
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="w-full bg-bg-primary border border-border-main rounded-xl pl-3 pr-4 py-2 text-xs text-white outline-none focus:border-accent-tertiary placeholder-text-muted"
              />
            </div>
          ) : (
            <span className="text-xs text-text-primary flex-1 font-mono">
              {activeTab === "jokes" ? "Ready for a break?" : "Ready for pre-made general study trivia?"}
            </span>
          )}

          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-accent-tertiary hover:bg-accent-tertiary/90 text-white font-semibold rounded-xl text-xs flex items-center gap-1.5 transition-colors shrink-0 disabled:opacity-50"
          >
            {loading ? <Loader className="w-3.5 h-3.5 animate-spin" /> : <Search className="w-3.5 h-3.5" />}
            {activeTab === "jokes" ? "Get Joke" : activeTab === "trivia" ? "Get Trivia" : "Execute Query"}
          </button>
        </form>
        <p className="text-[10px] text-text-secondary mt-1.5 leading-relaxed italic">
          {tools.find(t => t.id === activeTab)?.desc}
        </p>
      </div>

      {/* Results viewport */}
      <div className="flex-1 overflow-y-auto p-4 bg-bg-primary/20 space-y-4">
        {error && (
          <div className="p-3 bg-error/10 border border-error/20 text-error rounded-xl text-xs leading-relaxed animate-fade">
            {error}
          </div>
        )}

        {loading && (
          <div className="flex flex-col items-center justify-center p-12 text-center text-xs text-text-secondary">
            <Loader className="w-8 h-8 animate-spin text-accent-tertiary mb-3" />
            Querying academic servers...
          </div>
        )}

        {result && (
          <div className="space-y-4 animate-fade">
            {/* Visualizer card depending on API result */}
            <div className="bg-bg-tertiary border border-border-main rounded-xl p-4 space-y-2 select-text">
              {activeTab === "math" && (
                <div>
                  <span className="text-[10px] font-mono text-accent-tertiary uppercase font-bold tracking-wider">Newton Math Solver</span>
                  <h4 className="text-white font-mono font-medium text-xs mt-1">Operation: {result.operation}</h4>
                  <p className="text-white font-mono text-xs mt-1 bg-bg-primary p-2 rounded">Expression: {result.expression}</p>
                  <p className="text-success font-mono text-sm font-bold mt-2 bg-success/10 border border-success/20 p-3 rounded">
                    Result: {result.result}
                  </p>
                </div>
              )}

              {activeTab === "dictionary" && (
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold font-display text-white capitalize">{result.word}</h3>
                    <span className="text-xs text-text-secondary font-mono">{result.phonetic}</span>
                  </div>
                  {result.meanings?.map((m: any, i: number) => (
                    <div key={i} className="mt-3 border-t border-border-main pt-2">
                      <span className="text-[10px] font-mono uppercase bg-bg-secondary px-1.5 py-0.5 rounded text-accent-secondary">
                        {m.partOfSpeech}
                      </span>
                      <p className="text-xs text-white mt-1 leading-relaxed">
                        {m.definitions[0]?.definition}
                      </p>
                      {m.definitions[0]?.example && (
                        <p className="text-[11px] text-text-secondary italic mt-1 bg-bg-primary/40 p-1.5 rounded">
                          Example: "{m.definitions[0].example}"
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "chemistry" && (
                <div>
                  <span className="text-[10px] font-mono text-accent-tertiary uppercase font-bold tracking-wider">PubChem Profile</span>
                  <h3 className="text-white font-bold text-md font-display mt-1">{query.toUpperCase()}</h3>
                  <div className="grid grid-cols-2 gap-2 mt-2 text-xs">
                    <div className="bg-bg-primary p-2 rounded">
                      <span className="block text-[9px] text-text-secondary font-mono uppercase">Molecular Formula</span>
                      <span className="text-white font-semibold">{result.MolecularFormula}</span>
                    </div>
                    <div className="bg-bg-primary p-2 rounded">
                      <span className="block text-[9px] text-text-secondary font-mono uppercase">Molecular Weight</span>
                      <span className="text-white font-semibold">{result.MolecularWeight} g/mol</span>
                    </div>
                  </div>
                  <div className="bg-bg-primary p-2.5 rounded mt-2">
                    <span className="block text-[9px] text-text-secondary font-mono uppercase">Canonical SMILES</span>
                    <span className="text-[10px] text-accent-secondary font-mono break-all">{result.CanonicalSMILES}</span>
                  </div>
                </div>
              )}

              {activeTab === "translator" && (
                <div>
                  <span className="text-[10px] font-mono text-accent-tertiary uppercase font-bold tracking-wider">MyMemory Translator</span>
                  <p className="text-xs text-text-secondary mt-1">Source: {query}</p>
                  <p className="text-sm font-bold text-white mt-2 bg-bg-primary p-3 rounded leading-relaxed border border-border-main">
                    Translated: {result.translatedText}
                  </p>
                </div>
              )}

              {activeTab === "wikipedia" && (
                <div>
                  {result.thumbnail && (
                    <img 
                      src={result.thumbnail.source} 
                      alt={result.title} 
                      className="w-full h-32 object-cover rounded-lg border border-border-main mb-3"
                    />
                  )}
                  <h3 className="text-sm font-bold text-white font-display mb-1">{result.title}</h3>
                  <p className="text-xs text-text-primary leading-relaxed">{result.extract}</p>
                  {result.content_urls?.desktop?.page && (
                    <a 
                      href={result.content_urls.desktop.page} 
                      target="_blank" 
                      rel="noreferrer"
                      className="text-[10px] font-mono text-accent-secondary hover:underline block mt-3"
                    >
                      Read full article on Wikipedia →
                    </a>
                  )}
                </div>
              )}

              {activeTab === "countries" && (
                <div>
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{result.flag}</span>
                    <div>
                      <h3 className="text-sm font-bold text-white font-display">{result.name?.common}</h3>
                      <span className="text-[10px] text-text-secondary font-mono">{result.name?.official}</span>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3 text-xs">
                    <div className="bg-bg-primary p-2 rounded">
                      <span className="block text-[9px] text-text-secondary font-mono">CAPITAL</span>
                      <span className="text-white font-semibold">{result.capital?.[0] || "N/A"}</span>
                    </div>
                    <div className="bg-bg-primary p-2 rounded">
                      <span className="block text-[9px] text-text-secondary font-mono">POPULATION</span>
                      <span className="text-white font-semibold">{result.population?.toLocaleString()}</span>
                    </div>
                    <div className="bg-bg-primary p-2 rounded">
                      <span className="block text-[9px] text-text-secondary font-mono">CONTINENT</span>
                      <span className="text-white font-semibold">{result.continents?.[0] || "N/A"}</span>
                    </div>
                    <div className="bg-bg-primary p-2 rounded">
                      <span className="block text-[9px] text-text-secondary font-mono">CURRENCY</span>
                      <span className="text-white font-semibold">{Object.keys(result.currencies || {})[0] || "N/A"}</span>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "arxiv" && (
                <div className="space-y-3">
                  <span className="text-[10px] font-mono text-accent-tertiary uppercase font-bold tracking-wider">Scientific Papers on arXiv</span>
                  {result.map((paper: any, idx: number) => (
                    <div key={idx} className="bg-bg-primary p-3 rounded-xl border border-border-main space-y-1">
                      <h4 className="text-xs font-bold text-white font-display leading-tight">{paper.title}</h4>
                      <p className="text-[10px] text-text-secondary font-mono">Authors: {paper.authors}</p>
                      <p className="text-[11px] text-text-primary leading-relaxed line-clamp-3 mt-1.5">{paper.summary}</p>
                      <a href={paper.pdfLink} target="_blank" rel="noreferrer" className="text-[10px] font-mono text-accent-secondary hover:underline inline-block mt-2">
                        Open PDF Document →
                      </a>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "books" && (
                <div className="space-y-3">
                  <span className="text-[10px] font-mono text-accent-tertiary uppercase font-bold tracking-wider">Project Gutenberg Public Library</span>
                  {result.map((book: any, idx: number) => (
                    <div key={idx} className="bg-bg-primary p-3 rounded-xl border border-border-main flex gap-3">
                      {book.formats["image/jpeg"] && (
                        <img src={book.formats["image/jpeg"]} alt={book.title} className="w-10 h-14 object-cover border border-border-main rounded" />
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-xs font-bold text-white font-display truncate leading-tight">{book.title}</h4>
                        <p className="text-[10px] text-text-secondary font-mono mt-0.5">Author: {book.authors[0]?.name || "Unknown"}</p>
                        <p className="text-[9px] text-text-muted font-mono uppercase mt-1">Downloads: {book.download_count?.toLocaleString()}</p>
                        {book.formats["text/html"] && (
                          <a href={book.formats["text/html"]} target="_blank" rel="noreferrer" className="text-[9px] font-mono text-accent-secondary hover:underline block mt-1">
                            Read Free Book Online →
                          </a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "trivia" && (
                <div className="space-y-3">
                  <span className="text-[10px] font-mono text-accent-tertiary uppercase font-bold tracking-wider">Open Trivia Questions</span>
                  {result.map((q: any, idx: number) => (
                    <div key={idx} className="bg-bg-primary p-3 rounded-xl border border-border-main space-y-1">
                      <p className="text-xs text-white leading-relaxed font-display" dangerouslySetInnerHTML={{ __html: q.question }} />
                      <p className="text-[10px] text-success font-mono">Correct Answer: {q.correct_answer}</p>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "jokes" && (
                <div>
                  <span className="text-[10px] font-mono text-accent-tertiary uppercase font-bold tracking-wider">Break Time Programming Joke</span>
                  {result.joke ? (
                    <p className="text-sm text-white mt-2 leading-relaxed font-mono">{result.joke}</p>
                  ) : (
                    <div className="space-y-2 mt-2 font-mono text-sm leading-relaxed">
                      <p className="text-white font-bold">{result.setup}</p>
                      <p className="text-accent-secondary italic">{result.delivery}</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Send button to inject results in chat */}
            <button
              onClick={sendResultToChat}
              className="w-full py-2.5 bg-bg-tertiary hover:bg-bg-tertiary/75 border border-border-main text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-colors font-display"
            >
              <Send className="w-3.5 h-3.5" />
              Inject API Data into Chat Session
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
