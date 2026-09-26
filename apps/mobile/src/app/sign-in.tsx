import { useRef, useState } from 'react'
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { Button, Divider, Field, GoldText, Input, LogoMark, Screen, Txt } from '@/components'
import { actions } from '@/lib/local'
import { toast } from '@/lib/toast'
import { font, useTheme } from '@/theme'

const DEMO_CODE = '123456'
const validEmail = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e.trim())

/** Photographer sign-in: email → 6-digit code (demo code 123456), or password. Mirrors the web copy. */
export default function SignIn() {
  const { c } = useTheme()
  const [step, setStep] = useState<'email' | 'code' | 'password'>('email')
  const [email, setEmail] = useState('studio@northlight.in')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const codeRef = useRef<TextInput>(null)

  const finish = (addr: string) => {
    actions.signIn(addr.trim().toLowerCase())
    router.replace('/home')
  }

  const sendCode = async () => {
    if (!validEmail(email)) { setError('Enter an email address like name@studio.in'); return }
    setError(undefined); setBusy(true)
    await new Promise((r) => setTimeout(r, 600))
    setBusy(false); setStep('code')
    toast.info('Code sent', `Check ${email.trim()} — for this demo use ${DEMO_CODE}`)
    setTimeout(() => codeRef.current?.focus(), 250)
  }

  const verify = async (value = code) => {
    if (value.length !== 6) { setError('Enter all 6 digits from the email'); return }
    setBusy(true)
    await new Promise((r) => setTimeout(r, 400))
    setBusy(false)
    if (value !== DEMO_CODE) { setError('That code doesn’t match. Check the latest email, or use 123456 in this demo.'); return }
    finish(email)
  }

  const withPassword = () => {
    if (!validEmail(email)) { setError('Enter an email address like name@studio.in'); return }
    if (password.length < 6) { setError('Passwords have at least 6 characters'); return }
    finish(email)
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.surface }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Screen top style={{ backgroundColor: c.surface }} contentStyle={{ gap: 14, paddingHorizontal: 20 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 }}>
          <LogoMark />
          <Txt style={{ fontFamily: font.display, fontSize: 18 }}>Frameline</Txt>
        </View>
        <Txt style={{ fontFamily: font.display, fontSize: 30, lineHeight: 34 }}>Deliver every guest their photos <GoldText size={30}>by tonight.</GoldText></Txt>

        <View style={{ marginTop: 18, gap: 4 }}>
          <Txt v="h2">{step === 'code' ? 'Check your email' : 'Welcome back'}</Txt>
          <Txt v="small">{step === 'code' ? `We sent a 6-digit code to ${email.trim()}.` : 'New here? The same steps create your studio.'}</Txt>
        </View>

        {step === 'email' || step === 'password' ? (
          <>
            <Button label="Continue with Google" icon="globe" size="lg" onPress={() => { toast.success('Signed in with Google', 'Demo account: studio@northlight.in'); finish('studio@northlight.in') }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Divider style={{ flex: 1 }} /><Txt v="small" color={c.ink3}>or use email</Txt><Divider style={{ flex: 1 }} />
            </View>
            <Field label="Email address" error={error}>
              <Input icon="mail" value={email} onChangeText={(t) => { setEmail(t); setError(undefined) }} autoCapitalize="none" keyboardType="email-address" autoComplete="email" textContentType="emailAddress" placeholder="you@studio.in" returnKeyType="go" onSubmitEditing={step === 'email' ? sendCode : withPassword} invalid={!!error} />
            </Field>
            {step === 'password' ? (
              <Field label="Password">
                <Input icon="lock" value={password} onChangeText={(t) => { setPassword(t); setError(undefined) }} secureTextEntry autoComplete="password" textContentType="password" placeholder="Your password" onSubmitEditing={withPassword} returnKeyType="go" />
              </Field>
            ) : null}
            {step === 'email'
              ? <Button label="Email me a 6-digit code" variant="primary" size="lg" loading={busy} onPress={sendCode} />
              : <Button label="Sign in" variant="primary" size="lg" onPress={withPassword} />}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Pressable accessibilityRole="button" hitSlop={12} onPress={() => { setError(undefined); setStep(step === 'email' ? 'password' : 'email') }} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Txt v="label" color={c.accentText}>{step === 'email' ? 'Use password instead' : 'Email me a code instead'}</Txt>
              </Pressable>
              <Pressable accessibilityRole="button" hitSlop={12} style={{ minHeight: 44, justifyContent: 'center' }}
                onPress={() => validEmail(email) ? toast.success('Reset link sent', `Check ${email.trim()} for a link to set a new password`) : setError('Enter your email first, then tap Forgot password')}>
                <Txt v="small" color={c.ink3}>Forgot password?</Txt>
              </Pressable>
            </View>
          </>
        ) : (
          <>
            <Field label="6-digit code" error={error} hint={`Demo code: ${DEMO_CODE}`}>
              <Input ref={codeRef} mono value={code} maxLength={6} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" placeholder="••••••"
                onChangeText={(t) => { const v = t.replace(/\D/g, ''); setCode(v); setError(undefined); if (v.length === 6) verify(v) }} invalid={!!error} style={{ fontSize: 24, letterSpacing: 8 }} />
            </Field>
            <Button label="Sign in" variant="primary" size="lg" loading={busy} onPress={() => verify()} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <Pressable accessibilityRole="button" hitSlop={12} onPress={() => { setStep('email'); setCode(''); setError(undefined) }} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Txt v="label" color={c.accentText}>Use a different email</Txt>
              </Pressable>
              <Pressable accessibilityRole="button" hitSlop={12} onPress={() => toast.info('New code sent', `For this demo it’s still ${DEMO_CODE}`)} style={{ minHeight: 44, justifyContent: 'center' }}>
                <Txt v="small" color={c.ink3}>Resend code</Txt>
              </Pressable>
            </View>
          </>
        )}
        <Txt v="small" color={c.ink3}>By continuing you agree to the Terms of Use and Privacy Policy.</Txt>
        <Button label="I’m a guest, not a photographer" variant="ghost" onPress={() => { actions.setMode('guest'); router.replace('/events') }} />
      </Screen>
    </KeyboardAvoidingView>
  )
}
