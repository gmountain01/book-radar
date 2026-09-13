import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
import fetch_naver_key as module


class NaverKeyTest(unittest.TestCase):
    def test_rejected_key_preserves_file(self):
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp) / 'key.js'
            path.write_text('old key', encoding='utf-8')
            with patch.object(module, 'OUT_PATH', str(path)), patch.object(module, 'fetch_passport_key', return_value='fake'), patch.object(module, 'validate_key', side_effect=RuntimeError('invalid')):
                with self.assertRaises(SystemExit):
                    module.main()
            self.assertEqual(path.read_text(encoding='utf-8'), 'old key')

    def test_expired_response_rejected(self):
        with patch.object(module.urllib.request, 'urlopen', return_value=io.BytesIO(b'{"message":{"error":"expired"}}')):
            with self.assertRaises(RuntimeError):
                module.validate_key('fake')

    def test_valid_response(self):
        with patch.object(module.urllib.request, 'urlopen', return_value=io.BytesIO(b'{"message":{"result":{"html":"ok"}}}')):
            module.validate_key('fake')


if __name__ == '__main__':
    unittest.main()
