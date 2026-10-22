import type { Dictionary } from '@/lib/i18n'

export const ai: Dictionary = {
  // Sağlayıcılar ve alanlar (src/shared/ai.ts)
  'Anthropic (Claude)': 'Anthropic (Claude)',
  OpenAI: 'OpenAI',
  'Google Gemini': 'Google Gemini',
  'Azure OpenAI': 'Azure OpenAI',
  'OpenAI Uyumlu': 'OpenAI Compatible',
  'Claude modelleri; anahtar console.anthropic.com adresinden alınır.':
    'Claude models; get a key at console.anthropic.com.',
  'OpenAI modelleri; anahtar platform.openai.com adresinden alınır.':
    'OpenAI models; get a key at platform.openai.com.',
  'Gemini modelleri; anahtar aistudio.google.com adresinden alınır.':
    'Gemini models; get a key at aistudio.google.com.',
  'Kurumunuzun Azure OpenAI kaynağı.': "Your organization's Azure OpenAI resource.",
  'Ollama, LM Studio, vLLM gibi OpenAI uyumlu bir sunucu (kurum içi model).':
    'An OpenAI-compatible server such as Ollama, LM Studio or vLLM (on-premises model).',
  'API Anahtarı': 'API Key',
  'API Anahtarı (İsteğe Bağlı)': 'API Key (Optional)',
  'Çalışma Alanı Kimliği (İsteğe Bağlı)': 'Workspace ID (Optional)',
  'wrkspc_…': 'wrkspc_…',
  'Bir çalışma alanına bağlı olmayan kuruluş anahtarlarında gerekir: console.anthropic.com → Settings → Workspaces.':
    'Required for organization keys that are not scoped to a workspace: console.anthropic.com → Settings → Workspaces.',
  Model: 'Model',
  'Uç Nokta': 'Endpoint',
  'Dağıtım Adı': 'Deployment Name',
  'API Sürümü': 'API Version',
  Adres: 'Address',
  'sk-ant-…': 'sk-ant-…',
  'sk-…': 'sk-…',
  'AIza…': 'AIza…',
  'https://<kaynak>.openai.azure.com': 'https://<resource>.openai.azure.com',
  'http://localhost:11434/v1': 'http://localhost:11434/v1',
  'llama3.1': 'llama3.1',

  // Ayarlar → Yapay Zeka
  'Yapay Zeka': 'AI',
  'Yapay zeka sağlayıcısı ve yapay zeka ile çalışan özellikler.':
    'AI provider and AI-powered features.',
  Sağlayıcı: 'Provider',
  Kullanma: "Don't Use",
  'Yapay zeka özellikleri kapalı.': 'AI features are turned off.',
  'Kayıtlı (gizli)': 'Saved (hidden)',
  Değiştir: 'Change',
  Kaldır: 'Remove',
  'Bağlantıyı Dene': 'Test Connection',
  'Model Listesini Yenile': 'Refresh Model List',
  '{n} model': ({ n }) => `${n} ${n === 1 ? 'model' : 'models'}`,
  'Model seçin': 'Select a model',
  'Model listesi için önce adresi girin.': 'Enter the address first to load the model list.',
  'Model listesi için önce API anahtarını kaydedin.':
    'Save the API key first to load the model list.',
  'Bağlantı çalışıyor: {n} komut önerisi alındı.': ({ n }) =>
    `Connection works: received ${n} command ${n === 1 ? 'suggestion' : 'suggestions'}.`,
  'Bu sistemde işletim sisteminin anahtar deposu bulunamadı; API anahtarı yalnız zayıf şifrelemeyle saklanır.':
    'No operating system keyring was found; the API key is stored with weak encryption only.',
  'Yapay Zeka Özellikleri': 'AI Features',
  'Yapay Zeka ile Autocomplete': 'AI Autocomplete',
  'Terminalde Ctrl+Space ile açılan önerilerde yapay zekaya sorabilirsiniz (iki kez Ctrl+Space). Yanıt, seçip komut satırına yazabileceğiniz komut seçenekleri olarak gelir; komut siz Enter’a basmadan çalışmaz.':
    'Ask the AI from the terminal suggestions opened with Ctrl+Space (press Ctrl+Space twice). The answer arrives as command options you can pick and write to the command line; a command never runs until you press Enter.',
  'Bu bölümdeki bilgiler dışa aktarılmaz. API anahtarı işletim sisteminin anahtar deposuyla şifrelenip yalnız sizin kullanıcınıza kaydedilir ve ekrana geri getirilmez. Yapay zekaya sunucudan hiçbir veri gönderilmez; yalnız sorunuz, bu oturumdaki önceki sorularınız ve sunucunun türü (ör. Linux) gider.':
    'Nothing in this section is exported. The API key is encrypted with the operating system keyring, saved only for your user and never shown again. No data from the server is sent to the AI; only your question, your earlier questions in this session and the server type (e.g. Linux) are sent.',

  // Terminal: yapay zekaya sorma
  'Yapay zekaya sor…': 'Ask AI…',
  'Yapay Zekaya Sor': 'Ask AI',
  'Ne yapmak istiyorsunuz? (ör. kalan disk alanını göster)':
    'What do you want to do? (e.g. show free disk space)',
  'Yapay Zekaya Sorulacak Metin': 'Question for the AI',
  'Yapay zeka düşünüyor…': 'AI is thinking…',
  'Ayarları Aç': 'Open Settings',
  Riskli: 'Risky',
  Dikkat: 'Caution',
  'Bu soru için komut önerisi yok.': 'No command suggestions for this question.',
  'Sorunuzu yazıp Enter’a basın; yanıt komut seçenekleri olarak gelir.':
    'Type your question and press Enter; the answer arrives as command options.',
  'Enter sor · ↑↓ seç · Enter / Tab yaz · Esc kapat · Sunucudan veri gönderilmez':
    'Enter ask · ↑↓ select · Enter / Tab write · Esc close · No server data is sent',
  'Devam sorusu yazın ya da ↑↓ ile seçip Enter’a basın':
    'Type a follow-up question, or pick with ↑↓ and press Enter',
  '+{n} önceki soru bağlamda': ({ n }) =>
    `+${n} earlier ${n === 1 ? 'question' : 'questions'} in context`,
  'Sohbeti Temizle': 'Clear Conversation',
  'Riskli Komut': 'Risky Command',
  'Bu komut sunucuda geri alınamaz değişiklikler yapabilir ya da güvenliği etkileyebilir: {command}. Komut yalnız komut satırına yazılır; çalıştırmak için ayrıca Enter gerekir.':
    'This command may make irreversible changes on the server or affect its security: {command}. It is only written to the command line; running it still requires Enter.',
  'Yine de Yaz': 'Write Anyway',
  'Model listesi yükleniyor…': 'Loading the model list…',
  'Sağlayıcı kullanılabilir model döndürmedi.': 'The provider returned no usable models.',
  'Kullanmak için önce aşağıda bir sağlayıcı seçip alanlarını doldurun.':
    'To use it, first choose a provider below and fill in its fields.',
  'Yapay Zeka Sağlayıcısı': 'AI Provider'
}
