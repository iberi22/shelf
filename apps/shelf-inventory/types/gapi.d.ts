// Type declarations for Google APIs (gapi, GIS)
// Used by hooks/useGoogleDrive.ts

declare namespace gapi {
  function load(api: string, callback: () => void): void;

  namespace client {
    function init(config: { discoveryDocs: string[] }): Promise<void>;

    namespace drive {
      namespace files {
        function list(params: { q: string; fields: string }): Promise<{
          result: {
            files: Array<{ id: string; name: string }>;
          };
        }>;
      }
    }

    function getToken(): { access_token: string };
  }
}

declare namespace google {
  namespace accounts {
    namespace oauth2 {
      function initTokenClient(config: {
        client_id: string;
        scope: string;
        callback: (response: { error?: string; access_token?: string }) => void;
      }): {
        requestAccessToken(): void;
      };
    }
  }
}
