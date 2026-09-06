<?php

namespace Database\Seeders;

use App\Models\LegalDocument;
use Illuminate\Database\Seeder;

class LegalDocumentSeeder extends Seeder
{
    public function run(): void
    {
        // English universal Terms of Service
        LegalDocument::firstOrCreate(
            ['type' => 'terms', 'country' => '*', 'locale' => 'en', 'version' => '1.0.0'],
            [
                'title'   => 'Terms of Service',
                'content' => '<h1>Terms of Service</h1><p><strong>IMPORTANT:</strong> These are placeholder terms. '
                    . 'The application administrator must replace this content with your own Terms of Service '
                    . 'that comply with the laws of your jurisdiction.</p>'
                    . '<p>By using this application, you agree to the following terms...</p>'
                    . '<h2>1. Acceptance of Terms</h2>'
                    . '<p>By registering and using this application, you agree to be bound by these Terms of Service.</p>'
                    . '<h2>2. User Responsibilities</h2>'
                    . '<p>You are responsible for maintaining the confidentiality of your account credentials.</p>'
                    . '<h2>3. Contact</h2>'
                    . '<p>For questions about these terms, please contact the application administrator.</p>',
            ]
        );

        // Russian universal Terms of Service
        LegalDocument::firstOrCreate(
            ['type' => 'terms', 'country' => '*', 'locale' => 'ru', 'version' => '1.0.0'],
            [
                'title'   => 'Пользовательское соглашение',
                'content' => '<h1>Пользовательское соглашение</h1><p><strong>ВАЖНО:</strong> Это placeholder-текст. '
                    . 'Администратор приложения должен заменить это содержимое на своё Пользовательское соглашение, '
                    . 'соответствующее законодательству вашей юрисдикции.</p>'
                    . '<p>Используя данное приложение, вы соглашаетесь со следующими условиями...</p>'
                    . '<h2>1. Принятие условий</h2>'
                    . '<p>Регистрируясь и используя приложение, вы соглашаетесь соблюдать настоящее Пользовательское соглашение.</p>'
                    . '<h2>2. Обязанности пользователя</h2>'
                    . '<p>Вы несёте ответственность за сохранность своих учётных данных.</p>'
                    . '<h2>3. Контакты</h2>'
                    . '<p>По вопросам, связанным с соглашением, обращайтесь к администратору приложения.</p>',
            ]
        );

        // English universal Privacy Policy
        LegalDocument::firstOrCreate(
            ['type' => 'privacy', 'country' => '*', 'locale' => 'en', 'version' => '1.0.0'],
            [
                'title'   => 'Privacy Policy',
                'content' => '<h1>Privacy Policy</h1><p><strong>IMPORTANT:</strong> These are placeholder terms. '
                    . 'The application administrator must replace this content with your own Privacy Policy '
                    . 'that complies with the laws of your jurisdiction (e.g., GDPR, 152-FZ, CCPA).</p>'
                    . '<h2>1. Data We Collect</h2>'
                    . '<p>We collect the following personal data: name, email address, and any other information '
                    . 'you voluntarily provide.</p>'
                    . '<h2>2. Purpose of Processing</h2>'
                    . '<p>Your data is processed for the purpose of providing and improving the application services.</p>'
                    . '<h2>3. Data Retention</h2>'
                    . '<p>Your data is retained for as long as your account is active.</p>'
                    . '<h2>4. Your Rights</h2>'
                    . '<p>You have the right to access, correct, and delete your personal data.</p>'
                    . '<h2>5. Contact</h2>'
                    . '<p>For questions about data processing, please contact the application administrator.</p>',
            ]
        );

        // Russian universal Privacy Policy
        LegalDocument::firstOrCreate(
            ['type' => 'privacy', 'country' => '*', 'locale' => 'ru', 'version' => '1.0.0'],
            [
                'title'   => 'Политика конфиденциальности',
                'content' => '<h1>Политика конфиденциальности</h1><p><strong>ВАЖНО:</strong> Это placeholder-текст. '
                    . 'Администратор приложения должен заменить это содержимое на свою Политику конфиденциальности, '
                    . 'соответствующую законодательству вашей юрисдикции (например, 152-ФЗ, GDPR, CCPA).</p>'
                    . '<h2>1. Какие данные мы собираем</h2>'
                    . '<p>Мы собираем следующие персональные данные: имя, адрес электронной почты, '
                    . 'а также любую другую информацию, которую вы предоставляете добровольно.</p>'
                    . '<h2>2. Цель обработки</h2>'
                    . '<p>Ваши данные обрабатываются с целью предоставления и улучшения услуг приложения.</p>'
                    . '<h2>3. Срок хранения</h2>'
                    . '<p>Ваши данные хранятся в течение всего времени активности вашей учётной записи.</p>'
                    . '<h2>4. Ваши права</h2>'
                    . '<p>Вы имеете право на доступ, исправление и удаление ваших персональных данных.</p>'
                    . '<h2>5. Контакты</h2>'
                    . '<p>По вопросам обработки данных обращайтесь к администратору приложения.</p>',
            ]
        );
    }
}
