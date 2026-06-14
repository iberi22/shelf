import { useCallback, useState } from 'react';

const DISCOVERY_DOC = 'https://www.googleapis.com/discovery/v1/apis/drive/v3/rest';
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

export const useGoogleDrive = () => {
  const clientId = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const initGapi = useCallback(async () => {
    return new Promise<void>((resolve, reject) => {
      // @ts-expect-error
      if (!window.gapi) {
        reject(new Error('Google API not loaded'));
        return;
      }
      // @ts-expect-error
      window.gapi.load('client', async () => {
        try {
          // @ts-expect-error
          await window.gapi.client.init({
            discoveryDocs: [DISCOVERY_DOC],
          });
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  }, []);

  const authorize = useCallback(async () => {
    return new Promise<string>((resolve, reject) => {
      // @ts-expect-error
      if (!window.google) {
        reject(new Error('Google Identity Services not loaded'));
        return;
      }

      if (!clientId) {
        reject(new Error('Google Client ID no está configurado (VITE_GOOGLE_CLIENT_ID)'));
        return;
      }

      // @ts-expect-error
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPES,
        callback: (response: any) => {
          if (response.error) {
            reject(response);
          } else {
            setIsAuthorized(true);
            resolve(response.access_token);
          }
        },
      });
      client.requestAccessToken();
    });
  }, []);

  const uploadBackup = async (data: any) => {
    setIsLoading(true);
    setError(null);
    try {
      await initGapi();
      await authorize();

      const fileName = 'shelf_backup.json';
      const fileContent = JSON.stringify(data, null, 2);

      // 1. Search if file exists
      // @ts-expect-error
      const response = await window.gapi.client.drive.files.list({
        q: `name = '${fileName}' and trashed = false`,
        fields: 'files(id, name)',
      });

      const files = response.result.files;
      if (files && files.length > 0) {
        // 2. Update existing file
        const fileId = files[0].id;
        await fetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, {
          method: 'PATCH',
          headers: {
            // @ts-expect-error
            Authorization: `Bearer ${window.gapi.client.getToken().access_token}`,
            'Content-Type': 'application/json',
          },
          body: fileContent,
        });
      } else {
        // 3. Create new file
        const metadata = {
          name: fileName,
          mimeType: 'application/json',
        };

        const form = new FormData();
        form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
        form.append('file', new Blob([fileContent], { type: 'application/json' }));

        await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
          method: 'POST',
          headers: {
            // @ts-expect-error
            Authorization: `Bearer ${window.gapi.client.getToken().access_token}`,
          },
          body: form,
        });
      }

      return true;
    } catch (err) {
      console.error('Google Drive Backup Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during backup';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const downloadBackup = async () => {
    setIsLoading(true);
    setError(null);
    try {
      await initGapi();
      await authorize();

      const fileName = 'shelf_backup.json';
      // @ts-expect-error
      const response = await window.gapi.client.drive.files.list({
        q: `name = '${fileName}' and trashed = false`,
        fields: 'files(id, name)',
      });

      const files = response.result.files;
      if (files && files.length > 0) {
        const fileId = files[0].id;
        const fileResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
          headers: {
            // @ts-expect-error
            Authorization: `Bearer ${window.gapi.client.getToken().access_token}`,
          },
        });
        const data = await fileResponse.json();
        return data;
      } else {
        throw new Error('No backup file found in Google Drive');
      }
    } catch (err) {
      console.error('Google Drive Download Error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error during restore';
      setError(errorMessage);
      throw new Error(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  return { uploadBackup, downloadBackup, isLoading, isAuthorized, error };
};
