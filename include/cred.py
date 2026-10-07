import warnings

# Suppress urllib3 OpenSSL warning before importing osu
warnings.filterwarnings("ignore", message="urllib3 v2 only supports OpenSSL")

from urllib3.exceptions import NotOpenSSLWarning
from osu import Client

# Suppress NotOpenSSLWarning
warnings.filterwarnings("ignore", category=NotOpenSSLWarning)

# Module-level credentials for OAuth
client_id = "50461"
client_secret = "fgXrYFUMiuTFbidU4NMTikgIfWoL2fzQmQHql6Ft"

def env_cred():
    client = Client.from_client_credentials(
        client_id=client_id,
        client_secret=client_secret,

        # Leave this default to http://localhost
        redirect_url="http://localhost" 
    )
    return client

client = env_cred()

client = env_cred()
